import { Logger } from "./logger";
const logger = new Logger();
logger.info("Starting");

import { existsSync, mkdirSync } from "node:fs";
import { getApps } from "./config/appsConfig";
import { getDaemonConfig } from "./config/daemonConfig";
import { Container, registerContainer } from "./container/container";
import { initHttpServer } from "./http/httpServer";

async function init() {
    const daemonConfig = await getDaemonConfig();
    if (!existsSync(daemonConfig.app_archives_path)) {
        logger.info(`Creating app archives path (${daemonConfig.app_archives_path})`);
        mkdirSync(daemonConfig.app_archives_path);
    }
    if (!existsSync(daemonConfig.container_files_path)) {
        logger.info(`Creating container files path (${daemonConfig.container_files_path})`);
        mkdirSync(daemonConfig.container_files_path);
    }

    // TODO make sure all app archives are up to date and download those that aren't

    // TODO temporary for testing a container
    const apps = await getApps();

    const app = apps["minecraft_java_edition"];
    const variant = app.variants["release"];
    const version = variant.versions[""];

    registerContainer(new Container("aContainerId", {
        app,
        variant,
        version,
        name: "Test",
        runtimeImage: "java25",
        segments: 1,
        runtime: "java"
    }));
    await initHttpServer();
}

init().then(() => logger.info("Ready"));