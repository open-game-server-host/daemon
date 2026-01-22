import Docker from "dockerode";
import os from "os";
import { App, Variant, Version } from "../config/appsConfig";
import { getDaemonConfig } from "../config/daemonConfig";
import { getGlobalConfig } from "../config/globalConfig";
import { createDockerContainer, getDockerContainer, isDockerContainerRunning, removeDockerContainer } from "../docker";
import { Logger } from "../logger";
import { sleep } from "../utils";

const containersById = new Map<string, Container>();

export function registerContainer(container: Container) {
    containersById.set(container.getId(), container);
}

export function getContainer(id: string): Container | undefined {
    return containersById.get(id);
}

export interface ContainerCreateOptions {
    environment_variables: {[key: string]: string};
	max_cpus: number;
	memory_mb: number;
	bind_mounts?: ContainerCreateBindMountOptions[];
	port_mappings?: ContainerCreatePortMappingOptions[];
	image: string;
	name: string;
	network?: Docker.Network | string;
	container_read_only?: boolean;
}

export interface ContainerCreateBindMountOptions {
	container_folder: string;
	host_folder: string;
	readonly?: boolean;
}

export interface ContainerCreatePortMappingOptions {
	container_port: number;
	host_port: number;
}

type Action = () => void | Promise<void>;

interface ContainerOptions {
    app: App;
    variant: Variant;
    version: Version;
    segments: number;
    runtimeImage: string;
    name: string;
}

const stopReasons: {[code: number]: string} = {
    0: "normal_close",
    1: "app_error",
    2: "app_error",
    126: "app_error",
    127: "app_error",
    137: "killed",
    139: "memory_error",
    143: "normal_close"
} as const;

const maxCpus = os.cpus().length;

export class Container {
    private readonly logger;

    private actionQueue: Action[] = [];
    private terminated = false;

    constructor(
        private readonly id: string,
        private readonly options: ContainerOptions
    ) {
        this.logger = new Logger(this.getContainerId());
        this.logger.info("Registered");

        (async () => {
            while (!this.terminated) {
                const action = this.actionQueue.shift();
                if (action) {
                    await action();
                }
                await sleep(250);
            }
        })();
    }

    private queueAction(action: Action) {
        if (this.terminated) {
            throw new Error(`TODO could not queue action for container id '${this.id}' because it is terminated`);
        }
        this.actionQueue.push(action.bind(this));
    }

    getId(): string {
        return this.id;
    }

    getContainerId(): string {
        return `C_${this.id}`;
    }

    async isRunning(): Promise<boolean> {
        return isDockerContainerRunning(this.getContainerId());
    }

    async start() {
        this.queueAction(this.startAction);
    }

    private async startAction() {
        this.logger.info("Starting");

        // TODO check whether service is locked

        // TODO pull runtime image

        // TODO run auto-patcher

        // TODO remove container to update runtime image
        const containerId = this.getContainerId();
        await removeDockerContainer(containerId);
        
        const globalConfig = await getGlobalConfig();
        const container = await createDockerContainer({
            max_cpus: Math.min(globalConfig.segment.cpus * this.options.segments, maxCpus),
            environment_variables: {},
            image: this.options.runtimeImage,
            memory_mb: globalConfig.segment.memory_mb * this.options.segments,
            name: containerId,
            bind_mounts: [],
            port_mappings: [],
            container_read_only: true
        });
        
        // TODO sanitise configs

        await container.start();
        this.logger.info("Started");

        this.monitorContainer(container);
    }

    private async monitorContainer(container: Docker.Container) {
        // TODO start console monitor
        // TODO start stats monitor

        const output = await container.wait();
        const reason = stopReasons[output?.StatusCode] || "unknown";
        this.logger.info("Stopped", {
            reason
        });
    }

    async stop() {
        this.queueAction(this.stopAction);
    }
    
    private async stopAction() {
        this.logger.info("Stopping");
        const daemonConfig = await getDaemonConfig();
        const container = await getDockerContainer(this.getContainerId());
        if (this.options.variant.stop_command) {
            await this.commandAction(this.options.variant.stop_command);
        } else {
            await container.stop({
                // TODO might need to set signal?
                t: daemonConfig.stop_seconds_timeout
            });
        }
    }

    async restart() {
        this.logger.info("Restarting");
        this.queueAction(this.startAction);
        this.queueAction(this.stopAction);
    }

    async kill() {
        this.queueAction(this.killAction);
    }

    private async killAction() {
        this.logger.info("Killing");
        const container = await getDockerContainer(this.getContainerId());
        await container.kill();
    }

    async command(command: string) {
        this.logger.info("Executing command");
        this.queueAction(async () => await this.commandAction(command));
    }

    private async commandAction(command: string) {
        const container = await getDockerContainer(this.getContainerId());
        if (!await isDockerContainerRunning(container)) {
            throw new Error(`TODO tried to execute command for container id '${this.getContainerId()}' but it was offline`);
        }
        const attach = await container.attach({
            logs: false,
            stdin: true,
            stderr: false,
            stdout: false
        });
        attach.write(command); // TODO catch error
    }

    async install() {
        this.logger.info("Installing");
        this.actionQueue = []; // Clear the action queue because other actions are in the context of the previous installation
        this.actionQueue.push(async () => {

        });
    }

    async setConfig() {

    }

    async getConfigs() {

    }

    async terminate() {
        this.logger.info("Terminating");
        this.terminated = true;
    }
}