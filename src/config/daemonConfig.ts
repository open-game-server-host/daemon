import { Config } from "@open-game-server-host/backend-lib";
import { constants } from "../constants";
import { getDaemonConfigBranch } from "../env";

interface Daemon {
    port: number; // default 8080
    appArchivesPath: string;
    containerFilesPath: string;
    startupFilesPath: string;
    stopSecondsTimeout: number; // default 120
    runtimeImagesBranch: string;
    appInstallerImage: string;
    previousLogsToShowOnConnect: number; // default 30
    websocketEventPushFrequencyMs: number; // default 1000
    maxWebsocketConnectionsPerContainerPerUser: number; // default 3
}

class DaemonConfig extends Config<Daemon> {
    constructor() {
        super(
            "Daemon",
            constants.github_user_content_url,
            "configs",
            getDaemonConfigBranch(),
            "daemon.json"
        );
    }
}

const daemonConfig = new DaemonConfig();

export async function getDaemonConfig(): Promise<Daemon> {
    return daemonConfig.getConfig();
}

export async function getAppArchivePath(appId: string, variantId: string, versionId: string, build: number): Promise<string> {
    const daemonConfig = await getDaemonConfig();
    return `${daemonConfig.appArchivesPath}/${appId}-${variantId}-${versionId}-${build}.7z`;
}