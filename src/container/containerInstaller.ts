import { asyncCmd, Version } from "@open-game-server-host/backend-lib";
import { mkdirSync } from "fs";
import { rm } from "fs/promises";
import { getAppArchivePath } from "../apps/appArchiveCache";
import { isRunning } from "../daemon";
import { ContainerWrapper } from "./container";

interface QueuedInstall {
    wrapper: ContainerWrapper;
    version: Version;
    positionInQueue: number;
    finish: () => void;
}
let installQueue: QueuedInstall[] | undefined;

export async function queueContainerInstall(wrapper: ContainerWrapper, version: Version) {
    let processQueue = false;
    if (!installQueue) {
        processQueue = true;
        installQueue = [];
    }

    const promise = new Promise<void>(finish => {
        installQueue!.push({
            version,
            wrapper,
            positionInQueue: installQueue!.length + 1,
            finish
        });
    });

    if (processQueue) {
        (async () => {
            do {
                const install = installQueue.shift();
                if (!install) {
                    break;
                }
                
                install.wrapper.log("Install started");
                const { appId: appId, variantId: variantId, versionId: versionId } = install.wrapper.getOptions();
                const appArchivePath = await getAppArchivePath(appId, variantId, versionId, install.version.currentBuild);
                const containerFilesPath = install.wrapper.getContainerFilesPath();
                await rm(containerFilesPath, { recursive: true, force: true });
                mkdirSync(containerFilesPath);
                await asyncCmd(`7zz x "${appArchivePath}" -bso0 -bsp0 -o"${containerFilesPath}"`, true);
                const uid = await asyncCmd("id -u", true);
                await asyncCmd(`chown -R ${uid}:${uid} "${containerFilesPath}"`);
                install.wrapper.log("Install finished");
                install.finish();
            } while (installQueue.length > 0 && isRunning());
            installQueue = undefined;
        })();
    }

    return promise;
}