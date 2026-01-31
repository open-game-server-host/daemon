import { getApps, getGlobalConfig, getVersion, Logger, OGSHError } from "@open-game-server-host/backend-lib";
import { createWriteStream, existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { getAppArchivePath } from "../config/daemonConfig";

const logger = new Logger("APP ARCHIVE CACHE");

interface ArchiveUpdate {
    progressCallbacks: ((progress: DownloadProgress) => void)[];
    downloadProgress: DownloadProgress;
}

interface DownloadProgress {
    bytesTotal: number;
    bytesProcessed: number;
}

const archivesBeingUpdated = new Map<string, ArchiveUpdate>();

readdirSync("app_archives").forEach(file => {
    if (file.endsWith(".downloading")) {
        logger.info(`Removing partially downloaded archive: ${file}`);
        rmSync(`app_archives/${file}`);
    }
});

export async function checkAppArchiveAreUpToDate() {
    logger.info("Checking apps are up to date");
    const apps = await getApps();
    for (const [appId, app] of Object.entries(apps)) {
        for (const [variantId, variant] of Object.entries(app.variants)) {
            for (const [versionId, version] of Object.entries(variant.versions)) {
                updateAppArchive(appId, variantId, versionId, version.current_build);
            }
        }
    }
}

export async function isAppArchiveLatestBuild(appId: string, variantId: string, versionId: string, build: number): Promise<boolean> {
    const version = await getVersion(appId, variantId, versionId);
    return version?.current_build === build;
}

export async function updateAppArchive(appId: string, variantId: string, versionId: string, build: number, progressCallback?: (progress: DownloadProgress) => void) {
    const archivePath = await getAppArchivePath(appId, variantId, versionId, build);
    if (archivesBeingUpdated.has(archivePath)) {
        if (progressCallback) {
            archivesBeingUpdated.get(archivePath)!.progressCallbacks.push(progressCallback);
        }
        return;
    }
    if (existsSync(archivePath)) {
        return;
    }

    const downloadProgress: DownloadProgress = {
        bytesTotal: 1,
        bytesProcessed: 0
    }
    const update: ArchiveUpdate = {
        downloadProgress,
        progressCallbacks: []
    }
    if (progressCallback) {
        update.progressCallbacks.push(progressCallback);
    }
    archivesBeingUpdated.set(archivePath, update);

    logger.info(`Downloading ${appId} / ${variantId} / ${versionId} / ${build}`);
    const globalConfig = await getGlobalConfig();
    const response = await fetch(`http://${globalConfig.app_archive_url}/v1/archive/${appId}/${variantId}/${versionId}/${build}`);
    if (!response.body) {
        throw new OGSHError("general/unspecified", `no response.body for ${appId} / ${variantId} / ${versionId} / ${build}`);
    }

    const contentLength = response.headers.get("Content-Length");
    if (!contentLength) {
        throw new OGSHError("general/unspecified", `missing Content-Length header downloading archive for ${appId} / ${variantId} / ${versionId} / ${build}`);
    }
    downloadProgress.bytesTotal = +contentLength;

    const reader = response.body?.getReader();
    const tempArchivePath = `${archivePath}.downloading`;
    const writeStream = createWriteStream(tempArchivePath);
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            renameSync(tempArchivePath, archivePath);
            logger.info(`Finished downloading ${appId} / ${variantId} / ${versionId} / ${build}`)
            break;
        }

        writeStream.write(value);
        downloadProgress.bytesProcessed += value.byteLength;
        archivesBeingUpdated.get(archivePath)?.progressCallbacks.forEach(cb => cb(downloadProgress));
    }
}