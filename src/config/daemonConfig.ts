import { Config } from "@open-game-server-host/backend-lib";
import { constants } from "../constants";
import { getDaemonConfigBranch } from "../env";

interface Daemon {
    port: number; // default 8080
    app_archives_path: string;
    container_files_path: string;
    startup_files_path: string;
    stop_seconds_timeout: number; // default 120
    runtime_images_branch: string;
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
    return `${daemonConfig.app_archives_path}/${appId}-${variantId}-${versionId}-${build}.7z`;
}