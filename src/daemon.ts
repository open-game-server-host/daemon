import { Logger } from "@open-game-server-host/backend-lib";
const logger = new Logger("MAIN");
logger.info("Starting");

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { getDaemonContainers } from "./api";
import { cleanupPartiallyDownloadedAppArchives } from "./apps/appArchiveCache";
import { getDaemonConfig } from "./config/daemonConfig";
import { APP_ARCHIVES_PATH, CONTAINER_FILES_PATH } from "./constants";
import { ContainerWrapper } from "./container/container";
import { connectToApi } from "./ws/wsClient";

// TODO need to be able to write the api key for key rotations
export const API_KEY = readFileSync("/ogsh/api_key").toString();

async function init() {
    const daemonConfig = await getDaemonConfig();
    if (!existsSync(APP_ARCHIVES_PATH)) {
        logger.info(`Creating app archives path (${APP_ARCHIVES_PATH})`);
        mkdirSync(APP_ARCHIVES_PATH, { recursive: true });
    }
    if (!existsSync(CONTAINER_FILES_PATH)) {
        logger.info(`Creating container files path (${CONTAINER_FILES_PATH})`);
        mkdirSync(CONTAINER_FILES_PATH, { recursive: true });
    }

    await cleanupPartiallyDownloadedAppArchives(logger);

    const containers = await getDaemonContainers();
    logger.info("Retrieved active containers from API", {
        amount: containers.length
    });
    containers.forEach(container => ContainerWrapper.register(container.id, {
        appId: container.appId,
        containerId: container.id,
        ipv4Ports: container.ipv4Ports,
        ipv6Ports: container.ipv6Ports,
        segments: container.segments,
        variantId: container.variantId,
        versionId: container.versionId
    }));

    connectToApi();
}

init().then(() => logger.info("Ready"));