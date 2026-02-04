import { Logger } from "@open-game-server-host/backend-lib";
const logger = new Logger("MAIN");
logger.info("Starting");

import { existsSync, mkdirSync } from "node:fs";
import { cleanupPartiallyDownloadedAppArchives } from "./apps/appArchiveCache";
import { getDaemonConfig } from "./config/daemonConfig";
import { initHttpServer } from "./http/httpServer";

async function init() {
    const daemonConfig = await getDaemonConfig();
    if (!existsSync(daemonConfig.app_archives_path)) {
        logger.info(`Creating app archives path (${daemonConfig.app_archives_path})`);
        mkdirSync(daemonConfig.app_archives_path, { recursive: true });
    }
    if (!existsSync(daemonConfig.container_files_path)) {
        logger.info(`Creating container files path (${daemonConfig.container_files_path})`);
        mkdirSync(daemonConfig.container_files_path, { recursive: true });
    }

    await cleanupPartiallyDownloadedAppArchives();

    // TODO load this daemon's containers from the api

    await initHttpServer(logger);
}

init().then(() => logger.info("Ready"));