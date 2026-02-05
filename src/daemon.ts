import { getApps, Logger } from "@open-game-server-host/backend-lib";
const logger = new Logger("MAIN");
logger.info("Starting");

import { existsSync, mkdirSync } from "node:fs";
import { cleanupPartiallyDownloadedAppArchives } from "./apps/appArchiveCache";
import { getDaemonConfig } from "./config/daemonConfig";
import { initHttpServer } from "./http/httpServer";
import { ContainerWrapper } from "./container/container";

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

    const apps = await getApps();
    let id = 0;
    let hostPort = 20000;
    for (const [appId, app] of Object.entries(apps)) {
        if (!app.variants || Object.keys(app.variants).length === 0) {
            continue;
        }
        for (const [variantId, variant] of Object.entries(app.variants)) {
            if (!variant.versions || Object.keys(variant.versions).length === 0) {
                continue;
            }
            for (const [versionId, version] of Object.entries(variant.versions)) {
                ContainerWrapper.register(`${++id}`, {
                    appId,
                    variantId,
                    versionId,
                    dockerImage: version.default_docker_image,
                    ports: [
                        {
                            containerPort: 25565,
                            hostPort: hostPort++
                        }
                    ],
                    segments: 3
                });
            }
        }
    }
    logger.info(`Started ${id} servers`);
}

init().then(() => logger.info("Ready"));