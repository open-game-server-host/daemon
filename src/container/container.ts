import EventEmitter from "events";
export const containerEventEmitter = new EventEmitter();

import { ContainerPorts, ContainerRegisterData, getApp, getGlobalConfig, getVariant, getVersion, getVersionRuntime, Logger, OGSHError, sleep, Version } from "@open-game-server-host/backend-lib";
import Docker from "dockerode";
import os from "os";
import path from "path";
import Stream from "stream";
import { getDaemonConfig } from "../config/daemonConfig";
import { getStartupFilesPath } from "../config/startupFilesConfig";
import { CONTAINER_CONTAINER_FILES_PATH } from "../constants";
import { createDockerContainer, getDockerContainer, isDockerContainerRunning, pullDockerImage, removeDockerContainer, startDockerContainer } from "../docker";
import { getHostContainerFilesPath } from "../env";
import { sendContainerLogsAndStats } from "../ws/wsClient";
import { queueContainerInstall } from "./containerInstaller";
import { ContainerStats } from "./stats/containerStats";
import { getCpuMonitor, getMemoryMonitor, getNetworkMonitor, getStorageMonitor } from "./stats/monitor";

const containerWrappersById = new Map<string, ContainerWrapper>();

export function getContainerWrapper(id: string): ContainerWrapper | undefined {
    return containerWrappersById.get(id);
}

export function getContainerWrappers(): ContainerWrapper[] {
    return Array.from(containerWrappersById.values());
}

export interface ContainerCreateOptions {
    environmentVariables: {[key: string]: string};
	maxCpus: number;
	memoryMb: number;
	bindMounts?: ContainerCreateBindMountOptions[];
	ipv4PortMappings?: ContainerCreatePortMappingOptions[];
    ipv6PortMappings?: ContainerCreatePortMappingOptions[];
	image: string;
	name: string;
	network?: Docker.Network | string;
	containerReadOnly?: boolean;
}

export interface ContainerCreateBindMountOptions {
	container_folder: string;
	host_folder: string;
	readonly?: boolean;
}

export interface ContainerCreatePortMappingOptions {
	containerPort: number;
	hostPort: number;
}

export interface ContainerLogsAndStats {
    stats: ContainerStats;
    logs: string[];
}

type Action = () => void | Promise<void>;

export interface ContainerWrapperOptions {
    appId: string;
    variantId: string;
    versionId: string;
    ports: ContainerPorts;
    runtime: string;
    segments: number;
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

export async function validateContainerApp(appId: string, variantId: string, versionId: string): Promise<Version> {
    const version = await getVersion(appId, variantId, versionId);
    if (!version) {
        throw new OGSHError("container/invalid", `invalid version, app id '${appId}' variant id '${variantId}' version id '${versionId}'`);
    }
    return version;
}

function validateContainerSegments(segments: number) {
    if (!Number.isInteger(segments) || segments <= 0) {
        throw new OGSHError("container/invalid", `segments should be a positive integer, not '${segments}'`);
    }
}

export function validateContainerPorts(portsData: ContainerPorts) {
    Object.entries(portsData).forEach(([ipVersion, ports]) => {
        if (!Array.isArray(ports)) {
            throw new OGSHError("container/invalid", `ip version '${ipVersion}' ports should be an array of integers, not '${ports}'`);
        }
        for (const port of ports) {
            if (!Number.isInteger(port.containerPort)) {
                throw new OGSHError("container/invalid", `ip version '${ipVersion}' does not contain field 'containerPort'`);
            }
            if (!Number.isInteger(port.hostPort)) {
                throw new OGSHError("container/invalid", `ip id '${ipVersion}' does not contain field 'hostPort'`);
            }
        }
    });
}

const maxCpus = os.cpus().length;

export class ContainerWrapper {
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

    private constructor(
        private readonly id: string,
        private readonly options: ContainerWrapperOptions
    ) {
        this.logger = new Logger(`CONTAINER: ${id}`);
        this.logger.info("Registered");

        this.isRunning().then(async running => {
            if (!running) {
                return;
            }
            this.monitorContainer(await getDockerContainer(this.getContainerId()));
        });

        (async () => {
            while (!this.terminated && this.isRunning()) {
                const action = this.actionQueue.shift();
                if (action) {
                    try {
                        await action();
                    } catch (error) {
                        this.logger.error(error as Error);
                        this.actionQueue = []; // Clear action queue when an error occurs because the container's state might be invalid
                    }
                }
                await sleep(250);
            }
        }).bind(this)();

        (async () => {
            const daemonConfig = await getDaemonConfig();
            const containerFilesPath = this.getContainerFilesPath();
            const version = await getVersion(this.options.appId, this.options.variantId, this.options.versionId);
            if (!version) {
                throw new OGSHError("app/version-not-found", `tried to get storage monitor for container id '${this.id}' but app id '${this.options.appId}' variant id '${this.options.variantId}' version id '${this.options.versionId}' not found`);
            }
            const storageMonitor = getStorageMonitor(getVersionRuntime(version));
            while (!this.terminated && this.isRunning()) {
                this.mostRecentStats.timestamp = Date.now();
                this.mostRecentStats.storage = await storageMonitor(this, containerFilesPath).catch(error => this.mostRecentStats.storage); // Storage needs to be tracked even when the container is offline because people can upload/download files
                const logsAndStats: ContainerLogsAndStats = {
                    logs: this.pendingLogs,
                    stats: this.mostRecentStats
                }
                this.pendingLogs = [];

                sendContainerLogsAndStats(this.id, logsAndStats);

                await sleep(daemonConfig.websocketEventPushFrequencyMs);
            }
        })();
    }

    static async register(id: string, options: ContainerRegisterData): Promise<ContainerWrapper> {
        const version = await validateContainerApp(options.appId, options.variantId, options.versionId);
        validateContainerSegments(options.segments);
        validateContainerPorts(options.ports);
        const wrapper = new ContainerWrapper(id, {
            ...options,
            runtime: version.defaultRuntime
        });
        containerWrappersById.set(wrapper.getId(), wrapper);
        return wrapper;
    }

    private async queueAction(action: Action) {
        if (this.terminated) {
            throw new OGSHError("container/terminated", `could not queue action for container id '${this.id}'`);
        }
        const daemonConfig = await getDaemonConfig();
        if (this.actionQueue.length >= daemonConfig.containerActionQueueMaxLength) {
            throw new OGSHError("general/unspecified", `container id '${this.id}' max action queue length reached (${this.actionQueue.length})`);
        }
        this.actionQueue.push(action.bind(this));
    }

    getId(): string {
        return this.id;
    }

    getContainerId(): string {
        return `C_${this.id}`;
    }

    getOptions(): ContainerWrapperOptions {
        return this.options;
    }

    getContainerFilesPath(): string {
        return path.resolve(`${CONTAINER_CONTAINER_FILES_PATH}/${this.id}`);
    }

    private async getContainerResources(): Promise<{
        max_cpus: number;
        memory_mb: number
    }> {
        const globalConfig = await getGlobalConfig();
        return {
            max_cpus: Math.min(globalConfig.segment.maxCpus * this.options.segments, maxCpus),
            memory_mb: globalConfig.segment.memoryMb * this.options.segments,
        }
    }

    async getDockerImage(): Promise<string> {
        const version = await getVersion(this.options.appId, this.options.variantId, this.options.versionId);
        if (!version) {
            throw new OGSHError("app/variant-not-found", `failed to get runtime image for app id '${this.options.appId}' variant id '${this.options.variantId}' version id '${this.options.versionId}'`);
        }
        const runtime = version.supportedRuntimes.includes(this.options.runtime) ? this.options.runtime : version.defaultRuntime;
        const globalConfig = await getGlobalConfig();
        const daemonConfig = await getDaemonConfig();
        return `${globalConfig.dockerRegistryUrl}/container-runtimes/${runtime}:${daemonConfig.runtimeImagesBranch}`;
    }

    async isRunning(): Promise<boolean> {
        return isDockerContainerRunning(this.getContainerId());
    }

    async getContainerPid(): Promise<number> {
        const container = await getDockerContainer(this.getContainerId());

        await sleep(250); // Just in case ps is run before app starts

        return await new Promise<number>(async res => {
            container.exec({
                AttachStdin: true,
                AttachStdout: true,
                Cmd: ["ps", "-o", "pid="]
            }, async (error, exec) => {
                if (error) {
                    throw new OGSHError("container/pid-not-found", error);
                }

                if (!exec) {
                    throw new OGSHError("container/pid-not-found", "container exec is undefined");
                }

                const duplex = await exec.start({
                    stdin: true,
                    hijack: true
                });
                const stream = new Stream.PassThrough();
                container.modem.demuxStream(duplex, stream, process.stderr);

                stream.on("data", chunk => {
                    const data = `${chunk}`;

                    try {
                        res(+data.split("\n")[1]);
                    } catch (error) {
                        throw new OGSHError("container/pid-not-found", error as Error);
                    }
                });
            });
        }).catch(error => {
            throw new OGSHError("container/pid-not-found", error);
        });
    }

    start() {
        this.queueAction(this.startAction);
    }

    private async startAction() {
        this.logger.info("Starting", {
            appId: this.options.appId,
            variantId: this.options.variantId,
            versionId: this.options.versionId
        });

        if (await this.isRunning()) {
            this.logger.debug(`Attempted to start but alreayd running`);
            return;
        }

        // Validate and update runtime image
        this.logger.debug(`Pulling docker image`);
        const globalConfig = await getGlobalConfig();
        const fullDockerImage = await this.getDockerImage();
        await pullDockerImage(globalConfig.dockerRegistryUrl, fullDockerImage, this.logger);

        // TODO run auto-patcher

        // Remove old container to use new runtime image
        this.logger.debug(`Removing old container`);
        await removeDockerContainer(this.getContainerId());

        this.logger.debug(`Creating environment variables`);
        const app = await getApp(this.options.appId);
        const variant = await getVariant(this.options.appId, this.options.variantId);
        const version = await getVersion(this.options.appId, this.options.variantId, this.options.versionId);
        const environmentVariables = {
            ...app?.environmentVariables,
            ...variant?.environmentVariables,
            ...version?.environmentVariables
        }

        this.logger.debug(`Creating docker container`);
        const container = await createDockerContainer({
            ...await this.getContainerResources(),
            environmentVariables: environmentVariables,
            image: fullDockerImage,
            name: this.getContainerId(),
            bindMounts: [
                {
                    container_folder: "/ogsh/files",
                    host_folder: `${getHostContainerFilesPath()}/${this.id}`
                },
                {
                    container_folder: "/ogsh/startup_files",
                    host_folder: await getStartupFilesPath(this.options.appId, this.options.variantId),
                    readonly: false
                }
            ],
            ipv4PortMappings: this.options.ports[4] || [],
            ipv6PortMappings: this.options.ports[6] || [],
            maxCpus: globalConfig.segment.maxCpus * this.options.segments,
            memoryMb: globalConfig.segment.memoryMb * this.options.segments
        });

        // TODO sanitise configs

        this.logger.debug(`Starting docker container`);
        await startDockerContainer(container);
        this.logger.info("Started");

        containerEventEmitter.emit("start", this);
        const sessionStart = Date.now();

        let running = false;
        (async () => {
            for (let attempt = 1; attempt <= 3; attempt++) {
                if (!running) {
                    return;
                }

                this.logger.info(`Starting container monitors`, {
                    attempt
                });
                let success = false;
                await this.monitorContainer(container, sessionStart).then(() => success = true).catch(error => {
                    this.logger.error(error);
                });
                if (success) {
                    return;
                }
            }
            this.logger.error(new OGSHError("general/unspecified", `Failed to start container monitors for id '${this.id}', container will run but there will be no console logs or statistics`));
        })();

        container.wait().then(output => {
            containerEventEmitter.emit("stop", this);

            this.mostRecentStats.sessionLength = 0;
            this.mostRecentStats.online = false;
            this.mostRecentStats.cpu = {
                total: 100,
                used: 0
            };
            this.mostRecentStats.memory.used = 0;
            this.mostRecentStats.network = {
                in: 0,
                out: 0
            };
            const reason = stopReasons[output?.StatusCode] || "unknown";
            this.logger.info("Stopped", {
                reason,
                appId: this.options.appId,
                variantId: this.options.variantId,
                versionId: this.options.versionId,
                build: version?.currentBuild
            });
        });
    }

    private async monitorContainer(container: Docker.Container, sessionStart: number = Date.now()) {
        const version = await getVersion(this.options.appId, this.options.variantId, this.options.versionId);
        if (!version) {
            throw new OGSHError("app/version-not-found", `tried to run monitorContainer for container id '${this.id}' but app id '${this.options.appId}' variant id '${this.options.variantId}' version id '${this.options.versionId}' not found`)
        }
        const runtime = getVersionRuntime(version);
        const cpuMonitor = getCpuMonitor(runtime);
        const memoryMonitor = getMemoryMonitor(runtime);
        const networkMonitor = getNetworkMonitor(runtime);
        const totalNanoCpus = ((await getGlobalConfig()).segment.maxCpus) * this.options.segments * 1_000_000_000;
        const thisWrapper = this;
        await container.stats({
            stream: true
        }).then(stream => {
            let running = true;
            function stopHandler(wrapper: ContainerWrapper) {
                if (wrapper === thisWrapper) {
                    running = false;
                    containerEventEmitter.removeListener("stop", stopHandler);
                }
            }
            containerEventEmitter.addListener("stop", stopHandler);

            stream.on("data", async (data: Buffer) => {
                if (!running) {
                    stream.removeAllListeners();
                    return;
                }
                const rawStats = JSON.parse(data.toString());
                this.mostRecentStats.sessionLength = Date.now() - sessionStart;
                this.mostRecentStats.online = true;
                this.mostRecentStats.cpu = await cpuMonitor(this, totalNanoCpus, rawStats.cpu_stats, rawStats.precpu_stats).catch(error => this.mostRecentStats.cpu);
                this.mostRecentStats.memory = await memoryMonitor(this, rawStats.memory_stats).catch(error => this.mostRecentStats.memory);
                this.mostRecentStats.network = await networkMonitor(this, rawStats.networks).catch(error => this.mostRecentStats.network);
            });
        });

        const daemonConfig = await getDaemonConfig();
        await container.logs({
            follow: true,
            stdout: true,
            stderr: true,
            tail: daemonConfig.previousLogsToShowOnConnect
        }).then(stream => {
            stream.on("data", (data: Buffer) => {
                let message = data.toString();
                message = message.substring(8, message.length - 1); // Remove first 8 bytes and trailling new line
                this.pendingLogs.push(message);
                // console.log(`[${this.id}] ${message}`);
            });
        });
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
        if (variant.stopCommand) {
            this.commandAction(variant.stopCommand);
        } else {
            container.stop({
                t: daemonConfig.stopSecondsTimeout
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
            throw new OGSHError("container/offline", `could not execute command for offline container id '${this.id}'`);
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

        const version = await getVersion(appId, variantId, versionId);
        if (!version) {
            throw new OGSHError("app/version-not-found", `failed to install container id '${this.id}' with app id '${appId}' variant id '${variantId}' version id '${versionId}'`);
        }

        // Make sure app archive is downloaded
        let percent = 0;
        await updateAppArchive(appId, variantId, versionId, version.currentBuild, this.logger, progress => {
            const newPercent = Math.floor(100 / progress.bytesTotal * progress.bytesProcessed);
            if (percent !== newPercent) {
                percent = newPercent;
                this.pendingLogs.push(`  Downloading files ${percent}%`);
            }
        });

        this.options.appId = appId;
        this.options.variantId = variantId;
        this.options.versionId = versionId;
        this.options.runtime = version.defaultRuntime;
        await queueContainerInstall(this, version);

        this.logger.info("Install finished");
    }

    terminate() {
        this.logger.info("Terminating");
        this.terminated = true;
    }

    async updateOptions(options: Partial<ContainerWrapperOptions>) {
        for (const [key, value] of Object.entries(options)) {
            (this.options as any)[key] = value; // TODO validate this works
        }
    }

    log(msg: string) {
        this.pendingLogs.push(msg);
    }
}

function updateAppArchive(appId: string, variantId: string, versionId: string, currentBuild: number, logger: Logger, arg5: (progress: any) => void) {
    throw new Error("Function not implemented.");
}
