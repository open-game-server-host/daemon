import { DownloadProgress, downloadToFile, getGlobalConfig, getVersion, Logger, OGSHError, sleep } from "@open-game-server-host/backend-lib";
import { existsSync, readdirSync, rmSync } from "fs";
import { CONTAINER_APP_ARCHIVES_PATH } from "../constants";
import { API_KEY, isRunning } from "../daemon";

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

interface PendingDownload {
    appId: string;
    variantId: string;
    versionId: string;
    build: number;
    logger: Logger;
    resolve: () => void;
    reject: (reason?: any) => void;
    progress: (progress: DownloadProgress) => void;
}

const downloadQueue: PendingDownload[] = [];

(async () => {
    while (isRunning()) {
        await sleep(0.5);
        let next: PendingDownload | undefined;
        while ((next = downloadQueue.shift())) {
            const { appId, variantId, versionId, build, logger } = next;
            let success = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                logger.info(`Downloading ${appId} / ${variantId} / ${versionId} / ${build} (${downloadQueue.length} remaining)`, {
                    attempt
                });
                const archivePath = await getAppArchivePath(appId, variantId, versionId, build);
                const globalConfig = await getGlobalConfig();
                const archiveUrl = `http://${globalConfig.appArchiveUrl}/v1/archive/${appId}/${variantId}/${versionId}/${build}`;

                await downloadToFile(archiveUrl, archivePath, {
                    headers: {
                        authorization: API_KEY
                    }
                }, next.progress)
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
        }
    }
})();

export async function downloadLatestAppArchive(appId: string, variantId: string, versionId: string, logger: Logger, progress: (progress: DownloadProgress) => void) {
    const version = await getVersion(appId, variantId, versionId);
    if (!version) {
        throw new OGSHError("app/version-not-found", `could not download latest version of app id '${appId}' variant id '${variantId}' version id '${versionId}'`);
    }

    const archivePath = await getAppArchivePath(appId, variantId, versionId, version.currentBuild);
    if (existsSync(archivePath)) {
        return;
    }

    return new Promise<void>((resolve, reject) => {
        const pending: PendingDownload = {
            appId,
            variantId,
            versionId,
            build: version.currentBuild,
            logger,
            resolve,
            reject,
            progress
        }
        downloadQueue.push(pending);
    });
}