import { Logger } from "./logger";
const logger = new Logger("MAIN");
logger.info("Starting");

import { existsSync, mkdirSync } from "node:fs";
import { getDaemonConfig } from "./config/daemonConfig";
import { Container, registerContainer } from "./container/container";
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

    // TODO make sure all app archives are up to date and download those that aren't

    // TODO temporary for testing a container
    registerContainer(new Container("aContainerId", {
        appId: "minecraft_java_edition",
        variantId: "vanilla",
        versionId: "1.21.11",
        name: "Test",
        runtimeImage: "java25",
        segments: 4,
        runtime: "java"
    }));
    await initHttpServer(logger);
}

init().then(() => logger.info("Ready"));