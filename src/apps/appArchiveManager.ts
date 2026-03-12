import { DownloadProgress, downloadToFile, getGlobalConfig, getVersion, Logger, OGSHError } from "@open-game-server-host/backend-lib";
import { existsSync, readdirSync, renameSync, rmSync } from "fs";
import { CONTAINER_APP_ARCHIVES_PATH } from "../constants";
import { API_KEY } from "../daemon";

export async function cleanupPartiallyDownloadedAppArchives(logger: Logger) {
    readdirSync(CONTAINER_APP_ARCHIVES_PATH).forEach(file => {
        if (file.endsWith(".downloading")) {
            logger.info(`Removing partially downloaded archive`, {
                file
            });
            rmSync(`${CONTAINER_APP_ARCHIVES_PATH}/${file}`);
        }
    });
}

export async function isAppArchiveLatestBuild(appId: string, variantId: string, versionId: string, build: number): Promise<boolean> {
    const version = await getVersion(appId, variantId, versionId);
    return version?.currentBuild === build;
}

export async function getAppArchivePath(appId: string, variantId: string, versionId: string, build: number, basePath: string = CONTAINER_APP_ARCHIVES_PATH): Promise<string> {
    return `${basePath}/${appId}-${variantId}-${versionId}-${build}.7z`;
}

interface DownloadListener {
    res: () => void;
    rej: (reason?: any) => void;
    progress: (progress: DownloadProgress) => void;
}

const downloadListeners = new Map<string, DownloadListener[]>();

function getId(appId: string, variantId: string, versionId: string): string {
    return `${appId}_${variantId}_${versionId}`;
}

function getDownloadListeners(id: string): DownloadListener[] {
    return downloadListeners.get(id) || [];
}

export async function downloadLatestAppArchive(appId: string, variantId: string, versionId: string, logger: Logger, progress: (progress: DownloadProgress) => void) {
    const version = await getVersion(appId, variantId, versionId);
    if (!version) {
        throw new OGSHError("app/version-not-found", `could not download archive for app id '${appId}' variant id '${variantId}' version id '${versionId}'`);
    }
    const build = version.currentBuild;

    const archivePath = await getAppArchivePath(appId, variantId, versionId, build);
    if (existsSync(archivePath)) {
        return;
    }

    const id = getId(appId, variantId, versionId);
    if (!downloadListeners.has(id)) {
        downloadListeners.set(id, []);
        logger.info("Downloading app archive", {
            appId,
            variantId,
            versionId
        });

        (async () => {
            const tempArchivePath = `${archivePath}.downloading`;
            let success = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                logger.info(`Downloading ${appId} / ${variantId} / ${versionId} / ${build}`, {
                    attempt
                });
                const globalConfig = await getGlobalConfig();
                const archiveUrl = `http://${globalConfig.appArchiveUrl}/v1/archive/${appId}/${variantId}/${versionId}/${build}`;

                await downloadToFile(archiveUrl, tempArchivePath, {
                    headers: {
                        authorization: API_KEY
                    }
                }, progress => {
                    getDownloadListeners(id).forEach(listener => listener.progress(progress));
                })
                .then(() => success = true)
                .catch(error => {
                    logger.error(error, {
                        archiveUrl
                    });
                });

                if (success) {
                    break;
                }
            }

            if (success) {
                renameSync(tempArchivePath, archivePath);

                // Remove previous builds of this version
                for (let i = build - 1; i > 0; i--) {
                    const oldArchivePath = await getAppArchivePath(appId, variantId, versionId, i);
                    if (existsSync(oldArchivePath)) {
                        rmSync(oldArchivePath);
                    }
                }
                logger.info(`Finished downloading ${appId} / ${variantId} / ${versionId} / ${build}`);
                getDownloadListeners(id).forEach(listener => listener.res());
            } else {
                const error = new OGSHError("general/unspecified", `Failed to download ${appId} / ${variantId} / ${versionId} / ${build}`);
                getDownloadListeners(id).forEach(listener => listener.rej(error));
            }
            downloadListeners.delete(id);
        })();
    }

    return new Promise<void>((res, rej) => {
        const listeners = downloadListeners.get(id);
        if (listeners) {
            listeners.push({
                res,
                rej,
                progress
            });
            downloadListeners.set(id, listeners);
        } else {
            res();
        }
    });
}