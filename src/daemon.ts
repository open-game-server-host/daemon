import { getApps, Logger } from "@open-game-server-host/backend-lib";
const logger = new Logger("MAIN");
logger.info("Starting");

import { existsSync, mkdirSync } from "node:fs";
import { getDaemonContainers } from "./api";
import { cleanupPartiallyDownloadedAppArchives, updateAppArchive } from "./apps/appArchiveCache";
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

    await cleanupPartiallyDownloadedAppArchives(logger);
    const apps = await getApps();
    for (const [appId, app] of Object.entries(apps || {})) {
        for (const [variantId, variant] of Object.entries(app.variants || {})) {
            for (const [versionId, version] of Object.entries(variant.versions || {})) {
                updateAppArchive(appId, variantId, versionId, version.current_build, logger);
            }
        }
    }

    // TODO get actual daemon id from a config file or something
    (await getDaemonContainers("1")).forEach(container => {
        ContainerWrapper.register(container.id, {
            app_id: container.app_id,
            ports: container.ports,
            runtime: container.runtime,
            segments: container.segments,
            variant_id: container.variant_id,
            version_id: container.version_id
        });
    });

    await initHttpServer(logger);
}

init().then(() => logger.info("Ready"));