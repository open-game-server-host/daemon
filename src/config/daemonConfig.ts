import { Config, parseEnvironmentVariables } from "@open-game-server-host/backend-lib";

interface Daemon {
    port: number; // default 8080
    stopSecondsTimeout: number; // default 120
    runtimeImagesBranch: string;
    appInstallerImage: string;
    previousLogsToShowOnConnect: number; // default 30
    websocketEventPushFrequencyMs: number; // default 1000
    maxWebsocketConnectionsPerContainerPerUser: number; // default 3
}

const env = parseEnvironmentVariables([
    {
        key: "DAEMON_CONFIG_BRANCH",
        defaultValue: "main"
    }
]);

class DaemonConfig extends Config<Daemon> {
    constructor() {
        super({
            name: "Daemon",
            repo: "configs",
            branch: env.get("DAEMON_CONFIG_BRANCH")!,
            filePath: "daemon.json"
        });
    }
}

const daemonConfig = new DaemonConfig();

export async function getDaemonConfig(): Promise<Daemon> {
    return daemonConfig.getConfig();
}