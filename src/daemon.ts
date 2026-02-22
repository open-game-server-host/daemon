import { Logger } from "@open-game-server-host/backend-lib";
const logger = new Logger("MAIN");
logger.info("Starting");

import { existsSync, mkdirSync } from "node:fs";
import { getDaemonContainers } from "./api";
import { cleanupPartiallyDownloadedAppArchives } from "./apps/appArchiveCache";
import { getDaemonConfig } from "./config/daemonConfig";
import { ContainerWrapper } from "./container/container";
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