import { getGlobalConfig, Logger, UpdateDaemonData } from "@open-game-server-host/backend-lib";
const logger = new Logger("MAIN");
logger.info("Starting");

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "os";
import { getDaemonContainers, updateDaemon } from "./api";
import { cleanupPartiallyDownloadedAppArchives } from "./apps/appArchiveCache";
import { APP_ARCHIVES_PATH, CONTAINER_FILES_PATH } from "./constants";
import { ContainerWrapper } from "./container/container";
import { connectToApi } from "./ws/wsClient";

// TODO need to be able to write the api key for key rotations
export const API_KEY = readFileSync("/ogsh/api_key").toString();

async function init() {
    if (!existsSync(APP_ARCHIVES_PATH)) {
        logger.info(`Creating app archives path (${APP_ARCHIVES_PATH})`);
        mkdirSync(APP_ARCHIVES_PATH, { recursive: true });
    }
    if (!existsSync(CONTAINER_FILES_PATH)) {
        logger.info(`Creating container files path (${CONTAINER_FILES_PATH})`);
        mkdirSync(CONTAINER_FILES_PATH, { recursive: true });
    }

    await cleanupPartiallyDownloadedAppArchives(logger);

    const totalMemoryMb = os.totalmem() / 1_000_000 - 1024; // 1024mb reserved memory
    const globalConfig = await getGlobalConfig();
    const update: UpdateDaemonData = {
        cpuArch: process.arch,
        cpuName: os.cpus()[0].model,
        os: os.platform(),
        segmentsMax: Math.max(0, Math.floor(totalMemoryMb / globalConfig.segment.memoryMb))
    }
    logger.info("Updating daemon info", update);
    await updateDaemon(update);

    const containers = await getDaemonContainers();
    logger.info("Retrieved active containers from API", {
        amount: containers.length
    });
    containers.forEach(container => ContainerWrapper.register(container.id, {
        appId: container.appId,
        containerId: container.id,
        ports: container.ports,
        segments: container.segments,
        variantId: container.variantId,
        versionId: container.versionId
    }));

    connectToApi();
}

init().then(() => logger.info("Ready"));