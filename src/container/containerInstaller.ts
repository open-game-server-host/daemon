import { asyncCmd, Version } from "@open-game-server-host/backend-lib";
import { mkdirSync } from "fs";
import { rm } from "fs/promises";
import { getAppArchivePath } from "../apps/appArchiveDownloader";
import { getDaemonConfig } from "../config/daemonConfig";
import { isRunning } from "../daemon";
import { ContainerWrapper } from "./container";

interface QueuedInstall {
    wrapper: ContainerWrapper;
    version: Version;
    positionInQueue: number;
    resolve: () => void;
    reject: (reason?: any) => void;
}
let installQueue: QueuedInstall[] | undefined;

export async function queueContainerInstall(wrapper: ContainerWrapper, version: Version) {
    let processQueue = false;
    if (!installQueue) {
        processQueue = true;
        installQueue = [];
    }

    const promise = new Promise<void>((resolve, reject) => {
        installQueue!.push({
            version,
            wrapper,
            positionInQueue: installQueue!.length + 1,
            resolve,
            reject
        });
    });

    if (processQueue) {
        (async () => {
            do {
                const daemonConfig = await getDaemonConfig();
                const promises: Promise<void>[] = [];
                for (let i = 0; i < 1; i++) {
                    promises.push(new Promise<void>(async res => {
                        const install = (installQueue || []).shift();
                        if (install) {
                            try {
                                install.wrapper.log("Install started");
                                const { appId: appId, variantId: variantId, versionId: versionId } = install.wrapper.getOptions();
                                const appArchivePath = await getAppArchivePath(appId, variantId, versionId, install.version.currentBuild);
                                const containerFilesPath = install.wrapper.getContainerFilesPath();
                                await rm(containerFilesPath, { recursive: true, force: true });
                                mkdirSync(containerFilesPath);
                                await asyncCmd(`7zz x "${appArchivePath}" -bso0 -bsp0 -o"${containerFilesPath}"`);
                                install.wrapper.log("Install finished");
                                install.resolve();
                            } catch (error) {
                                install.reject(error);
                            }
                        }
                        res();
                    }));
                }
                await Promise.allSettled(promises);
            } while (installQueue.length > 0 && isRunning());
            installQueue = undefined;
        })();
    }

    return promise;
}