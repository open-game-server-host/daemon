import { Logger } from "../logger";

export abstract class Config<T> {
    private readonly logger: Logger;
    private readonly fullUrl: string;

    private callbacks: (() => void)[] = [];
    private config: T | undefined;

    constructor(
        private readonly name: string,
        private readonly githubOrgUrl: string,
        private readonly repo: string,
        private readonly branch: string,
        private readonly filePath: string
    ) {
        this.fullUrl = `${this.githubOrgUrl}/${this.repo}/refs/heads/${this.branch}/${this.filePath}`;

        this.logger = new Logger(`CONFIG: ${name}`);
        this.logger.set("name", name);
        this.logger.set("githubOrgUrl", githubOrgUrl);
        this.logger.set("repo", repo);
        this.logger.set("branch", branch);
        this.logger.set("filePath", filePath);
        this.logger.set("fullUrl", this.fullUrl);

        this.updateConfig();
    }

    private async updateConfig() {
        const response = await fetch(this.fullUrl);
        this.config = await response.json();
        this.callbacks.forEach(cb => cb());
        this.callbacks = [];
        this.logger.info("Updated");
    }

    async getConfig(): Promise<T> {
        if (!this.config) {
            await new Promise<void>(res => this.callbacks.push(res));
        }
        return this.config!;
    }
}