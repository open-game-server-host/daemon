import { parseEnvironmentVariables } from "@open-game-server-host/backend-lib";

const parsedVariables = parseEnvironmentVariables([
    {
        key: "OGSH_DAEMON_CONFIG_BRANCH",
        defaultValue: "main"
    },
    {
        key: "OGSH_DAEMON_ID",
        defaultValue: "TEST DAEMON ID"
    },
    {
        key: "OGSH_DAEMON_API_KEY",
        defaultValue: "MAKE SURE THIS IS SET IN A PRODUCTION ENVIRONMENT"
    }
]);

export function getDaemonConfigBranch(): string {
    return parsedVariables.get("OGSH_DAEMON_CONFIG_BRANCH")!;
}

export function getDaemonId(): string {
    return parsedVariables.get("OGSH_DAEMON_ID")!;
}

export function getDaemonApiKey(): string {
    return parsedVariables.get("OGSH_DAEMON_API_KEY")!;
}