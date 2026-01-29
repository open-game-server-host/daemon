import { parseEnvironmentVariables } from "@open-game-server-host/backend-lib";

const parsedVariables = parseEnvironmentVariables([
    {
        key: "DAEMON_CONFIG_BRANCH",
        defaultValue: "main"
    }
]);

export function getDaemonConfigBranch(): string {
    return parsedVariables.get("DAEMON_CONFIG_BRANCH")!;
}