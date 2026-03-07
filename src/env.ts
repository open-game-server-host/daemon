import { parseEnvironmentVariables } from "@open-game-server-host/backend-lib";

const parsed = parseEnvironmentVariables([
    {
        key: "HOST_CONTAINER_FILES_PATH",
        defaultValue: "container_files"
    },
    {
        key: "HOST_STARTUP_FILES_PATH",
        defaultValue: "startup_files"
    }
]);

export function getHostContainerFilesPath(): string {
    return parsed.get("HOST_CONTAINER_FILES_PATH")!;
}

export function getHostStartupFilesPath(): string {
    return parsed.get("HOST_STARTUP_FILES_PATH")!;
}