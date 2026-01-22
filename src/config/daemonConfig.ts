import { constants } from "../constants";
import { getAppDaemonConfigBranch } from "../env";
import { Config } from "./config";

interface Daemon {
    port: number;
    app_archives_path: string;
    container_files_path: string;
    stop_seconds_timeout: number;
}

class DaemonConfig extends Config<Daemon> {
    constructor() {
        super(
            "Daemon",
            constants.github_user_content_url,
            "configs",
            getAppDaemonConfigBranch(),
            "daemon.json"
        );
    }
}

const daemonConfig = new DaemonConfig();

export async function getDaemonConfig(): Promise<Daemon> {
    return daemonConfig.getConfig();
}