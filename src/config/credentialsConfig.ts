import { existsSync, readFileSync } from "node:fs";

interface Credentials {
    github_packages_read_username: string;
    github_packages_read_token: string;
}

const credentialsPath = "credentials.json";

if (!existsSync(credentialsPath)) {
    throw new Error(`Credentials file missing! (${credentialsPath})`);
}

const credentials = JSON.parse(readFileSync(credentialsPath).toString());

if (!credentials.github_packages_read_username) {
    throw new Error("Missing github_packages_read_username from credentials file");
}
if (!credentials.github_packages_read_token) {
    throw new Error("Missing github_packages_read_token from credentials file");
}

export function getCredentials(): Credentials {
    return credentials;
}