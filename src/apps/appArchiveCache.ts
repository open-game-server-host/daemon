import { DownloadProgress, downloadToFile, getApps, getGlobalConfig, getVersion, Logger } from "@open-game-server-host/backend-lib";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { getAppArchivePath, getDaemonConfig } from "../config/daemonConfig";

const logger = new Logger("APP ARCHIVE CACHE");

const archivesBeingUpdated = new Map<string, ((progress: DownloadProgress) => void)[]>();

export async function cleanupPartiallyDownloadedAppArchives() {
    const daemonConfig = await getDaemonConfig();
    readdirSync(daemonConfig.app_archives_path).forEach(file => {
        if (file.endsWith(".downloading")) {
            logger.info(`Removing partially downloaded archive: ${file}`);
            rmSync(`app_archives/${file}`);
        }
    });
}

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
            archivesBeingUpdated.get(archivePath)!.push(progressCallback);
        }
        return;
    }
    if (existsSync(archivePath)) {
        return;
    }

    archivesBeingUpdated.set(archivePath, []);
    if (progressCallback) {
        archivesBeingUpdated.get(archivePath)!.push(progressCallback);
    }

    logger.info(`Downloading ${appId} / ${variantId} / ${versionId} / ${build}`);
    const globalConfig = await getGlobalConfig();
    const archiveUrl = `http://${globalConfig.app_archive_url}/v1/archive/${appId}/${variantId}/${versionId}/${build}`;
    await downloadToFile(archiveUrl, archivePath, {
        headers: {
            "authorization": "TODO"
        }
    }, progress => {
        archivesBeingUpdated.get(archivePath)!.forEach(cb => cb(progress));
    });
    archivesBeingUpdated.delete(archivePath);
}