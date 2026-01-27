import Docker from "dockerode";
import { mkdirSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "stream";
import { getApp, getAppArchivePath, getVariant, getVersion } from "../config/appsConfig";
import { getDaemonConfig } from "../config/daemonConfig";
import { getGlobalConfig } from "../config/globalConfig";
import { getStartupFilesPath } from "../config/startupFilesConfig";
import { constants } from "../constants";
import { createDockerContainer, getDockerContainer, isDockerContainerRunning, pullDockerImage, removeDockerContainer } from "../docker";
import { OGSHError } from "../error";
import { Logger } from "../logger";
import { sleep } from "../utils";
import { ContainerStats } from "./stats/containerStats";
import { getCpuMonitor, getMemoryMonitor, getNetworkMonitor, getStorageMonitor } from "./stats/monitor";

export const containerEventEmitter = new EventEmitter();

const containersById = new Map<string, Container>();

export function registerContainer(container: Container) {
    containersById.set(container.getId(), container);
}

export function getContainer(id: string): Container {
    const container = containersById.get(id);
    if (!container) {
        throw new OGSHError("container/not-found", `container id '${id}' not registered`);
    }
    return container;
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
    appId: string;
    variantId: string;
    versionId: string;
    segments: number;
    runtime: string;
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

    private pendingLogs: string[] = [];
    private mostRecentStats: ContainerStats = {
        cpu: {
            total: 100,
            used: 0
        },
        memory: {
            total: 0,
            used: 0
        },
        network: {
            in: 0,
            out: 0
        },
        online: false,
        sessionLength: 0,
        storage: {
            total: 0,
            used: 0
        },
        timestamp: 0
    }

    constructor(
        private readonly id: string,
        private readonly options: ContainerOptions
    ) {
        this.logger = new Logger(this.getContainerId());
        this.logger.info("Registered");

        this.isRunning().then(async running => {
            if (!running) {
                return;
            }
            this.monitorContainer(await getDockerContainer(this.getContainerId()))
        });

        (async () => {
            while (!this.terminated) {
                const action = this.actionQueue.shift();
                if (action) {
                    await action();
                }
                await sleep(250);
            }
        })();

        (async () => {
            const daemonConfig = await getDaemonConfig();
            const containerFilesPath = await this.getContainerFilesPath();
            const storageMonitor = getStorageMonitor(this.options.runtime);
            while (!this.terminated) {
                this.mostRecentStats.timestamp = Date.now();
                this.mostRecentStats.storage = await storageMonitor(this, containerFilesPath); // Storage needs to be tracked even when the container is offline because people can upload/download files
                const events = {
                    logs: this.pendingLogs,
                    stats: this.mostRecentStats
                }
                this.pendingLogs = [];

                // TODO push events to connected websockets asynchronously

                await sleep(daemonConfig.websocket_event_push_frequency_ms);
            }
        })();
    }

    private queueAction(action: Action) {
        if (this.terminated) {
            throw new OGSHError("container/terminated", `could not queue action for container id '${this.id}'`);
        }
        this.actionQueue.push(action.bind(this));
    }

    getId(): string {
        return this.id;
    }

    getContainerId(): string {
        return `C_${this.id}`;
    }

    getOptions(): ContainerOptions {
        return this.options;
    }

    async getContainerFilesPath(): Promise<string> {
        const daemonConfig = await getDaemonConfig();
        return path.resolve(`${daemonConfig.container_files_path}/${this.id}`); // Need to use absolute path to pass into a docker container
    }

    private async getContainerResources(): Promise<{
        max_cpus: number;
        memory_mb: number
    }> {
        const globalConfig = await getGlobalConfig();
        return {
            max_cpus: Math.min(globalConfig.segment.max_cpus * this.options.segments, maxCpus),
            memory_mb: globalConfig.segment.memory_mb * this.options.segments,
        }
    }

    async getRuntimeImage(): Promise<string> {
        let runtimeImage = this.options.runtimeImage;
        const variant = await getVariant(this.options.appId, this.options.variantId);
        if (!variant) {
            throw new OGSHError("app/variant-not-found", `failed to get runtime image for app id '${this.options.appId}' variant id '${this.options.variantId}'`);
        }
        const version = await getVersion(this.options.appId, this.options.variantId, this.options.versionId);
        if (!version?.supported_runtime_images.includes(runtimeImage)) {
            runtimeImage = version?.default_runtime_image || variant.default_runtime_image;
        }
        const daemonConfig = await getDaemonConfig();
        return `${runtimeImage}:${daemonConfig.runtime_images_branch}`;
    }

    async isRunning(): Promise<boolean> {
        return isDockerContainerRunning(this.getContainerId());
    }

    start() {
        this.queueAction(this.startAction);
    }

    private async startAction() {
        this.logger.info("Starting");

        if (await this.isRunning()) {
            return;
        }

        // TODO check whether service is locked

        const daemonConfig = await getDaemonConfig();

        // Validate and update runtime image
        let fullImagePath = daemonConfig.runtime_images_repo.endsWith("/") ? daemonConfig.runtime_images_repo : `${daemonConfig.runtime_images_repo}/`;
        fullImagePath += await this.getRuntimeImage();
        await pullDockerImage(daemonConfig.runtime_images_repo, fullImagePath, this.logger);

        // TODO run auto-patcher

        // Remove old container to use new runtime image
        const containerId = this.getContainerId();
        await removeDockerContainer(containerId);

        const app = await getApp(this.options.appId);
        const variant = await getVariant(this.options.appId, this.options.variantId);
        const version = await getVersion(this.options.appId, this.options.variantId, this.options.versionId);
        const environmentVariables = {
            ...app?.environment_variables,
            ...variant?.environment_variables,
            ...version?.environment_variables
        }

        const portMappings: ContainerCreatePortMappingOptions[] = [];
        Object.entries(variant?.ports || {}).forEach(([key, value]) => {
            portMappings.push({
                container_port: +key,
                host_port: +key
            });
        });

        const containerFilesPath = await this.getContainerFilesPath();
        const container = await createDockerContainer({
            ...await this.getContainerResources(),
            environment_variables: environmentVariables,
            image: fullImagePath,
            name: containerId,
            bind_mounts: [
                {
                    container_folder: "/ogsh/files",
                    host_folder: containerFilesPath
                },
                {
                    container_folder: "/ogsh/startup_files",
                    host_folder: await getStartupFilesPath(this.options.appId, this.options.variantId),
                    readonly: false
                }
            ],
            port_mappings: portMappings,
            container_read_only: true
        });
        
        // TODO sanitise configs

        await container.start();
        this.logger.info("Started");

        containerEventEmitter.emit("start", this);
        this.monitorContainer(container);
    }

    private async monitorContainer(container: Docker.Container) {
        const sessionStart = Date.now();
        const daemonConfig = await getDaemonConfig();

        container.logs({
            follow: true,
            stdout: true,
            stderr: true,
            tail: daemonConfig.previous_logs_to_show_on_connect
        }).then(stream => {
            stream.on("data", (data: Buffer) => {
                let message = data.toString();
                message = message.substring(8, message.length - 1); // Remove first 8 bytes and trailling new line
                this.pendingLogs.push(message);
                console.log(message);
            });
        });

        let running = true;
        (async () => {
            const cpuMonitor = getCpuMonitor(this.options.runtime);
            const memoryMonitor = getMemoryMonitor(this.options.runtime);
            const networkMonitor = getNetworkMonitor(this.options.runtime);
            const containerInfo = await container.inspect().catch(error => {
                throw new OGSHError("container/not-found", error);
            });
            const totalNanoCpus = containerInfo.HostConfig.NanoCpus;
            if (!totalNanoCpus) {
                throw new OGSHError("container/invalid", `HostConfig.NanoCpus not found for container id '${this.getContainerId()}'`)
            }
            while (running) {
                await new Promise<void>(res => {
                    container.stats({
                        stream: false,
                        "one-shot": true
                    }).then(async rawStats => {
                        this.mostRecentStats.sessionLength = sessionStart - Date.now();
                        this.mostRecentStats.online = true;
                        this.mostRecentStats.cpu = await cpuMonitor(this, totalNanoCpus, rawStats.cpu_stats, rawStats.precpu_stats);
                        this.mostRecentStats.memory = await memoryMonitor(this, rawStats.memory_stats);
                        this.mostRecentStats.network = await networkMonitor(this, rawStats.networks);
                        res();
                    });
                });
                // TODO sleep?
            }
        })();

        const output = await container.wait();
        running = false;
        this.mostRecentStats.sessionLength = 0;
        this.mostRecentStats.online = false;
        this.mostRecentStats.cpu = {
            total: 100,
            used: 0
        };
        this.mostRecentStats.memory = {
            total: 0,
            used: 0
        };
        this.mostRecentStats.network = {
            in: 0,
            out: 0
        };
        const reason = stopReasons[output?.StatusCode] || "unknown";
        this.logger.info("Stopped", {
            reason
        });
        containerEventEmitter.emit("stop", this);
    }

    stop() {
        this.queueAction(this.stopAction);
    }
    
    private async stopAction() {
        this.logger.info("Stopping");
        if (!await this.isRunning()) {
            return;
        }
        const daemonConfig = await getDaemonConfig();
        const container = await getDockerContainer(this.getContainerId());
        const variant = await getVariant(this.options.appId, this.options.variantId);
        if (!variant) {
            throw new OGSHError("app/variant-not-found", `failed to get stop command for app id '${this.options.appId}' variant id '${this.options.variantId}'`);
        }
        if (variant.stop_command) {
            this.commandAction(variant.stop_command);
        } else {
            container.stop({
                // TODO might need to set signal?
                t: daemonConfig.stop_seconds_timeout
            });
        }
        await new Promise<void>(res => {
            containerEventEmitter.on("stop", res);
        });
    }

    restart() {
        this.logger.info("Restarting");
        this.queueAction(this.stopAction);
        this.queueAction(this.startAction);
    }

    kill() {
        this.queueAction(this.killAction);
    }

    private async killAction() {
        this.logger.info("Killing");
        const container = await getDockerContainer(this.getContainerId());
        await container.kill();
    }

    command(command: string) {
        this.queueAction(async () => await this.commandAction(command));
    }
    
    private async commandAction(command: string) {
        this.logger.info("Executing command");
        const container = await getDockerContainer(this.getContainerId());
        if (!await isDockerContainerRunning(container)) {
            throw new OGSHError("container/offline", `could not execute command for offline container id '${this.getContainerId()}'`);
        }
        const stream = await container.attach({
            hijack: true,
            stdin: true,
            stream: true
        });
        stream.write(`${command}\n`, error => {
            if (error) {
                throw new OGSHError("container/command-failed", error);
            }
        });
    }

    install(appId: string, variantId: string, versionId: string) {
        this.actionQueue = []; // Clear the action queue because other actions are in the context of the previous installation
        this.queueAction(async () => await this.installAction(appId, variantId, versionId));
        this.queueAction(this.startAction);
    }
    
    private async installAction(appId: string, variantId: string, versionId: string) {
        this.logger.info("Installing");

        if (!await getVersion(appId, variantId, versionId)) {
            throw new OGSHError("app/version-not-found", `failed to install container id '${this.id}' with app id '${appId}' variant id '${variantId}' version id '${versionId}'`);
        }

        await removeDockerContainer(this.getContainerId());
        const containerFilesPath = await this.getContainerFilesPath();
        rmSync(containerFilesPath, { recursive: true, force: true });
        mkdirSync(containerFilesPath);

        await pullDockerImage("ghcr.io/open-game-server-host/app-installer-image", "ghcr.io/open-game-server-host/app-installer-image/install:main", this.logger);

        // Run container installer so that decompression doesn't happen inside this app
        // The user has already been allocated CPU time with their app so just use that
        const daemonConfig = await getDaemonConfig();
        const appArchivePath = await getAppArchivePath(appId, variantId, versionId);
        const options = {
            ...await this.getContainerResources(),
            image: daemonConfig.app_installer_image,
            name: this.getContainerId(),
            container_read_only: true,
            bind_mounts: [
                {
                    container_folder: constants.container_work_dir,
                    host_folder: containerFilesPath
                },
                {
                    container_folder: "/archive",
                    host_folder: path.resolve(appArchivePath)
                }
            ],
            environment_variables: {
                APP_ARCHIVE_PATH: "/archive",
                OUTPUT_PATH: constants.container_work_dir
            },
            network: "none"
        };
        const appInstallerContainer = await createDockerContainer(options);
        await appInstallerContainer.start();
        this.monitorContainer(appInstallerContainer);
        await appInstallerContainer.wait();
        
        await removeDockerContainer(this.getContainerId());
    }

    async setConfig() {

    }

    async getConfigs() {

    }

    terminate() {
        this.logger.info("Terminating");
        this.terminated = true;
    }
}