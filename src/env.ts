interface EnvironmentVariable {
    key: string;
    optional?: boolean;
    defaultValue?: string;
}

const env: EnvironmentVariable[] = [
    {
        key: "BRANCH",
        defaultValue: "main"
    },
    {
        key: "APPS_BRANCH",
        defaultValue: "main"
    },
    {
        key: "APP_DAEMON_CONFIG_BRANCH",
        defaultValue: "main"
    },
    {
        key: "GLOBAL_CONFIG_BRANCH",
        defaultValue: "main"
    }
];

const parsedValues = new Map<string, string>();
const missingRequiredVariables: string[] = [];
env.forEach(variable => {
    if (!process.env[variable.key]) {
        if (variable.defaultValue) {
            parsedValues.set(variable.key, variable.defaultValue);
            console.log(`Using default value for environment variable '${variable.key}' (${variable.defaultValue})`);
        } else {
            missingRequiredVariables.push(variable.key);
        }
    } else {
        parsedValues.set(variable.key, process.env[variable.key]!);
    }
});
if (missingRequiredVariables.length > 0) {
    throw new Error(`Missing required environment variables: ${missingRequiredVariables}`);
}

export function getBranch(): string {
    return parsedValues.get("BRANCH")!;
}

export function getAppsBranch(): string {
    return parsedValues.get("APPS_BRANCH")!;
}

export function getAppDaemonConfigBranch(): string {
    return parsedValues.get("APP_DAEMON_CONFIG_BRANCH")!;
}

export function getGlobalConfigBranch(): string {
    return parsedValues.get("GLOBAL_CONFIG_BRANCH")!;
}