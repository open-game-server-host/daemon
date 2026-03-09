import { DownloadProgress, downloadToFile, getGlobalConfig, getVersion, Logger, OGSHError } from "@open-game-server-host/backend-lib";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { CONTAINER_APP_ARCHIVES_PATH } from "../constants";
import { API_KEY, isRunning } from "../daemon";

interface PendingDownload {
    appId: string;
    variantId: string;
    versionId: string;
    build: number;
    promise: Promise<void>;
    resolve: () => void;
    reject: (reason?: any) => void;
}
let downloadQueue: PendingDownload[] | undefined;

interface ArchiveDownloadProgress extends DownloadProgress {
    finished: boolean;
    error?: Error;
}
const progressCallbacks = new Map<string, ((progress: ArchiveDownloadProgress) => void)[]>();

export async function cleanupPartiallyDownloadedAppArchives(logger: Logger) {
    readdirSync(CONTAINER_APP_ARCHIVES_PATH).forEach(file => {
        if (file.endsWith(".downloading")) {
            logger.info(`Removing partially downloaded archive`, {
                file
            });
            rmSync(`app_archives/${file}`);
        }
    });
}

export async function isAppArchiveLatestBuild(appId: string, variantId: string, versionId: string, build: number): Promise<boolean> {
    const version = await getVersion(appId, variantId, versionId);
    return version?.currentBuild === build;
}

export async function getAppArchivePath(appId: string, variantId: string, versionId: string, build: number): Promise<string> {
    return `${CONTAINER_APP_ARCHIVES_PATH}/${appId}-${variantId}-${versionId}-${build}.7z`;
}

export async function updateAppArchive(appId: string, variantId: string, versionId: string, build: number, logger: Logger, progressCallback?: (progress: ArchiveDownloadProgress) => void) {
    const archivePath = await getAppArchivePath(appId, variantId, versionId, build);

    if (existsSync(archivePath)) {
        return;
    }

    if (progressCallback) {
        const callbacks = progressCallbacks.get(archivePath) || [];
        callbacks.push(progressCallback);
        progressCallbacks.set(archivePath, callbacks);
    }

    let processQueue = false;
    if (!downloadQueue) {
        processQueue = true;
        downloadQueue = [];
    }
    const promise = new Promise<void>((resolve, reject) => {
        downloadQueue!.unshift({
            appId,
            variantId,
            versionId,
            build,
            promise,
            resolve,
            reject
        });
    });

    if (processQueue) {
        (async () => {
            do {
                const next = downloadQueue.pop();
                if (!next) {
                    break;
                }

                let lastProgress: DownloadProgress = {
                    bytesProcessed: 0,
                    bytesTotal: 0
                };
                let success = false;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    const { appId, variantId, versionId, build } = next;
                    logger.info(`Downloading ${appId} / ${variantId} / ${versionId} / ${build} (${downloadQueue.length} remaining)`, {
                        attempt
                    });
                    const archivePath = await getAppArchivePath(appId, variantId, versionId, build);
                    const globalConfig = await getGlobalConfig();
                    const archiveUrl = `http://${globalConfig.appArchiveUrl}/v1/archive/${appId}/${variantId}/${versionId}/${build}`;
                    await downloadToFile(archiveUrl, archivePath, {
                        headers: {
                            "authorization": API_KEY
                        }
                    }, progress => {
                        lastProgress = progress;
                        (progressCallbacks.get(archivePath) || []).forEach(cb => cb({
                            ...progress,
                            finished: false
                        }));
                    }).then(() => {
                        success = true;
                    }).catch(error => {
                        (progressCallbacks.get(archivePath) || []).forEach(cb => cb({
                            ...lastProgress,
                            finished: false,
                            error
                        }));
                        logger.error(error, {
                            archiveUrl
                        });
                    });

                    if (success) {
                        break;
                    }
                }
                if (success) {
                    (progressCallbacks.get(archivePath) || []).forEach(cb => cb({
                        ...lastProgress,
                        finished: true
                    }));
                    
                    // Remove previous builds of this version
                    for (let i = build - 1; i > 0; i--) {
                        const oldArchivePath = await getAppArchivePath(appId, variantId, versionId, i);
                        if (existsSync(oldArchivePath)) {
                            rmSync(oldArchivePath);
                        }
                    }
                    logger.info(`Finished downloading ${appId} / ${variantId} / ${versionId} / ${build} (${downloadQueue.length} remaining)`);
                    next.resolve();
                } else {
                    next.reject(new OGSHError("general/unspecified", `Failed to download ${appId} / ${variantId} / ${versionId} / ${build}`));
                }

            } while (downloadQueue.length > 0 && isRunning());
            downloadQueue = undefined;
        })();
    }

    return promise;
}