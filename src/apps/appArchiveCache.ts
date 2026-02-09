import { DownloadProgress, downloadToFile, getGlobalConfig, getVersion, Logger, sleep } from "@open-game-server-host/backend-lib";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { getAppArchivePath, getDaemonConfig } from "../config/daemonConfig";

const logger = new Logger("APP ARCHIVE CACHE");

interface Build {
    appId: string;
    variantId: string;
    versionId: string;
    build: number;
}
const downloadQueue: Build[] = [];

interface ArchiveDownloadProgress extends DownloadProgress {
    finished: boolean;
    error?: Error;
}
const progressCallbacks = new Map<string, ((progress: ArchiveDownloadProgress) => void)[]>();

export async function cleanupPartiallyDownloadedAppArchives() {
    const daemonConfig = await getDaemonConfig();
    readdirSync(daemonConfig.app_archives_path).forEach(file => {
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
    return version?.current_build === build;
}

export async function updateAppArchive(appId: string, variantId: string, versionId: string, build: number, progressCallback?: (progress: ArchiveDownloadProgress) => void) {
    const archivePath = await getAppArchivePath(appId, variantId, versionId, build);

    if (existsSync(archivePath)) {
        return;
    }

    if (progressCallback) {
        const callbacks = progressCallbacks.get(archivePath) || [];
        callbacks.push(progressCallback);
        progressCallbacks.set(archivePath, callbacks);
    }

    downloadQueue.unshift({
        appId,
        variantId,
        versionId,
        build
    });

    if (downloadQueue.length === 1) {
        (async () => {
            await sleep(100);
            do {
                const next = downloadQueue.pop();
                if (!next) {
                    break;
                }

                const { appId, variantId, versionId, build } = next;
                logger.info(`Downloading ${appId} / ${variantId} / ${versionId} / ${build} (${downloadQueue.length} remaining)`);
                const archivePath = await getAppArchivePath(appId, variantId, versionId, build);
                const globalConfig = await getGlobalConfig();
                const archiveUrl = `http://${globalConfig.app_archive_url}/v1/archive/${appId}/${variantId}/${versionId}/${build}`;
                let lastProgress: DownloadProgress;
                await downloadToFile(archiveUrl, archivePath, {
                    headers: {
                        "authorization": "TODO"
                    }
                }, progress => {
                    lastProgress = progress;
                    (progressCallbacks.get(archivePath) || []).forEach(cb => cb({
                        ...progress,
                        finished: false
                    }));
                }).catch(error => {
                    (progressCallbacks.get(archivePath) || []).forEach(cb => cb({
                        ...lastProgress,
                        finished: false,
                        error
                    }));
                    logger.error(error, {
                        archiveUrl
                    });
                }).finally(async () => {
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
                });

            } while (downloadQueue.length > 0);
        })();
    }
}