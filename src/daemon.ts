import { Logger } from "@open-game-server-host/backend-lib";
const logger = new Logger("MAIN");
logger.info("Starting");

import { existsSync, mkdirSync } from "node:fs";
import { cleanupPartiallyDownloadedAppArchives } from "./apps/appArchiveCache";
import { getDaemonConfig } from "./config/daemonConfig";
import { connectToApi } from "./ws/wsClient";

async function init() {
    const daemonConfig = await getDaemonConfig();
    if (!existsSync(daemonConfig.appArchivesPath)) {
        logger.info(`Creating app archives path (${daemonConfig.appArchivesPath})`);
        mkdirSync(daemonConfig.appArchivesPath, { recursive: true });
    }
    if (!existsSync(daemonConfig.containerFilesPath)) {
        logger.info(`Creating container files path (${daemonConfig.containerFilesPath})`);
        mkdirSync(daemonConfig.containerFilesPath, { recursive: true });
    }

    await cleanupPartiallyDownloadedAppArchives(logger);

    connectToApi();
}

init().then(() => logger.info("Ready"));