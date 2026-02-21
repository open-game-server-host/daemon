import { asyncCmd, Version } from "@open-game-server-host/backend-lib";
import { mkdirSync } from "fs";
import { rm } from "fs/promises";
import { getAppArchivePath } from "../config/daemonConfig";
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
                const appArchivePath = await getAppArchivePath(appId, variantId, versionId, install.version.current_build);
                const containerFilesPath = await install.wrapper.getContainerFilesPath();
                await rm(containerFilesPath, { recursive: true, force: true });
                mkdirSync(containerFilesPath);
                await asyncCmd(`7za x "${appArchivePath}" -bso0 -bsp0 -o"${containerFilesPath}"`, true);
                await asyncCmd(`chown -R 1337:1337 "${containerFilesPath}"`, true); // TODO won't be able to run this as non-root so make the container user and the daemon user part of the same group
                install.wrapper.log("Install finished");
                install.finish();
            } while (installQueue.length > 0);
            installQueue = undefined;
        })();
    }

    return promise;
}