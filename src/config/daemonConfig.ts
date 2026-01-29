import { constants } from "../constants";
import { getAppDaemonConfigBranch } from "../env";
import { Config } from "./config";

interface Daemon {
    port: number; // default 8080
    app_archives_path: string;
    container_files_path: string;
    startup_files_path: string;
    stop_seconds_timeout: number; // default 120
    runtime_images_branch: string;
    runtime_images_repo: string;
    app_installer_image: string;
    previous_logs_to_show_on_connect: number; // default 30
    websocket_event_push_frequency_ms: number; // default 1000
    max_websocket_connections_per_container_per_user: number; // default 3
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