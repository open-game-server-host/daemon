import { constants } from "../constants";
import { getAppDaemonConfigBranch } from "../env";
import { Config } from "./config";

interface Daemon {
    port: number;
    app_archives_path: string;
    container_files_path: string;
    startup_files_path: string;
    stop_seconds_timeout: number;
    runtime_images_branch: string;
    runtime_images_repo: string;
    app_installer_image: string;
    previous_logs_to_show_on_connect: number;
    websocket_event_push_frequency_ms: number;
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