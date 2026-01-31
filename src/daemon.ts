import { Logger } from "@open-game-server-host/backend-lib";
const logger = new Logger("MAIN");
logger.info("Starting");

import { existsSync, mkdirSync } from "node:fs";
import { checkAppArchiveAreUpToDate } from "./apps/appArchiveCache";
import { getDaemonConfig } from "./config/daemonConfig";
import { ContainerWrapper } from "./container/container";
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

    await checkAppArchiveAreUpToDate();

    // TODO temporary for testing a container
    ContainerWrapper.register("aContainerId", {
        appId: "minecraft_java_edition",
        variantId: "vanilla",
        versionId: "1.21.11",
        name: "Test",
        dockerImage: "java25",
        segments: 4
    });

    await initHttpServer(logger);
}

init().then(() => logger.info("Ready"));