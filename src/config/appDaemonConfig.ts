import { constants } from "../constants";
import { getAppDaemonConfigBranch } from "../env";
import { Config } from "./config";

interface AppDaemon {

}

class AppDaemonConfig extends Config<AppDaemon> {
    constructor() {
        super(
            "App Daemon",
            constants.config.github_user_content_url,
            "configs",
            getAppDaemonConfigBranch(),
            "app-daemon.json"
        );
    }
}

const appDaemonConfig = new AppDaemonConfig();

export async function getDaemonConfig(): Promise<AppDaemon> {
    return appDaemonConfig.getConfig();
}