import EventEmitter from "events";
export const containerEventEmitter = new EventEmitter();

import { ContainerPort, getApp, getGlobalConfig, getVariant, getVersion, getVersionRuntime, Logger, OGSHError, sleep, Version } from "@open-game-server-host/backend-lib";
import Docker from "dockerode";
import os from "os";
import path from "path";
import Stream from "stream";
import { WebSocket } from "ws";
import { updateAppArchive } from "../apps/appArchiveCache";
import { getDaemonConfig } from "../config/daemonConfig";
import { getStartupFilesPath } from "../config/startupFilesConfig";
import { createDockerContainer, getDockerContainer, isDockerContainerRunning, pullDockerImage, removeDockerContainer, startDockerContainer } from "../docker";
import { ContainerRegisterBody } from "../ws/routes/containerWsRoutes";
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

export interface ContainerWrapperOptions {
    appId: string;
    variantId: string;
    versionId: string;
    ports: ContainerPort[]; // container port : external port
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

function validateContainerRuntime(version: Version, dockerImage: string) {
    if (!version.supported_runtimes.includes(dockerImage)) {
        throw new OGSHError("container/invalid", `invalid docker image '${dockerImage}', supported docker images: ${version.supported_runtimes}`);
    }
}

function validateContainerPorts(ports: ContainerPort[]) {
    if (!Array.isArray(ports)) {
        throw new OGSHError("container/invalid", `ports should be an array of integers, not '${ports}'`);
    }
    for (const port of ports) {
        if (!Number.isInteger(port.container_port)) {
            throw new OGSHError("container/invalid", `one or more of the port objects does not contain field 'container_port'`);
        }
        if (!Number.isInteger(port.host_port)) {
            throw new OGSHError("container/invalid", `one or more of the port objects does not contain field 'host_port'`);
        }
    }
}

const maxCpus = os.cpus().length;

export class ContainerWrapper {
    private readonly logger;
    private readonly connectedWebsockets = new Map<WebSocket, string>();

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
            while (!this.terminated) {
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
            const containerFilesPath = await this.getContainerFilesPath();
            const version = await getVersion(this.options.appId, this.options.variantId, this.options.versionId);
            if (!version) {
                throw new OGSHError("app/version-not-found", `tried to get storage monitor for container id '${this.id}' but app id '${this.options.appId}' variant id '${this.options.variantId}' version id '${this.options.versionId}' not found`);
            }
            const storageMonitor = getStorageMonitor(getVersionRuntime(version));
            while (!this.terminated) {
                this.mostRecentStats.timestamp = Date.now();
                this.mostRecentStats.storage = await storageMonitor(this, containerFilesPath).catch(error => this.mostRecentStats.storage); // Storage needs to be tracked even when the container is offline because people can upload/download files
                const events = {
                    logs: this.pendingLogs,
                    stats: this.mostRecentStats
                }
                this.pendingLogs = [];

                // Send websocket messages in an async function so this loop is more in sync with websocket_event_push_frequency_ms
                (async () => {
                    const jsonString = JSON.stringify(events);
                    for (const ws of this.connectedWebsockets.keys()) {
                        ws.send(jsonString);
                    }
                })();

                await sleep(daemonConfig.websocket_event_push_frequency_ms);
            }
        })();
    }

    static async register(id: string, options: ContainerRegisterBody): Promise<ContainerWrapper> {
        const version = await validateContainerApp(options.appId, options.variantId, options.versionId);
        validateContainerSegments(options.segments);
        validateContainerPorts(options.ports);
        const wrapper = new ContainerWrapper(id, {
            ...options,
            runtime: version.default_runtime
        });
        containerWrappersById.set(wrapper.getId(), wrapper);
        return wrapper;
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

    getOptions(): ContainerWrapperOptions {
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

    async getDockerImage(): Promise<string> {
        const version = await getVersion(this.options.appId, this.options.variantId, this.options.versionId);
        if (!version) {
            throw new OGSHError("app/variant-not-found", `failed to get runtime image for app id '${this.options.appId}' variant id '${this.options.variantId}' version id '${this.options.versionId}'`);
        }
        const runtime = version.supported_runtimes.includes(this.options.runtime) ? this.options.runtime : version.default_runtime;
        const globalConfig = await getGlobalConfig();
        const daemonConfig = await getDaemonConfig();
        return `${globalConfig.docker_registry_url}/container-runtimes/${runtime}:${daemonConfig.runtime_images_branch}`;
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
            return;
        }

        // TODO check whether service is locked

        // Validate and update runtime image
        const globalConfig = await getGlobalConfig();
        const fullDockerImage = await this.getDockerImage();
        await pullDockerImage(globalConfig.docker_registry_url, fullDockerImage, this.logger);

        // TODO run auto-patcher

        // Remove old container to use new runtime image
        await removeDockerContainer(this.getContainerId());

        const app = await getApp(this.options.appId);
        const variant = await getVariant(this.options.appId, this.options.variantId);
        const version = await getVersion(this.options.appId, this.options.variantId, this.options.versionId);
        const environmentVariables = {
            ...app?.environment_variables,
            ...variant?.environment_variables,
            ...version?.environment_variables
        }

        const portMappings: ContainerCreatePortMappingOptions[] = [];
        this.options.ports.forEach(port => portMappings.push(port));

        const containerFilesPath = await this.getContainerFilesPath();
        const container = await createDockerContainer({
            ...await this.getContainerResources(),
            environment_variables: environmentVariables,
            image: fullDockerImage,
            name: this.getContainerId(),
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
            port_mappings: portMappings
        });

        // TODO sanitise configs

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
                build: version?.current_build
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
        const containerInfo = await container.inspect().catch(error => { // TODO this could be calculated instead of inspecting docker container
            throw new OGSHError("container/not-found", error);
        });
        const totalNanoCpus = containerInfo.HostConfig.NanoCpus;
        if (!totalNanoCpus) {
            throw new OGSHError("container/invalid", `HostConfig.NanoCpus not found for container id '${this.id}'`);
        }
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
            tail: daemonConfig.previous_logs_to_show_on_connect
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
        await updateAppArchive(appId, variantId, versionId, version.current_build, this.logger, progress => {
            const newPercent = Math.floor(100 / progress.bytesTotal * progress.bytesProcessed);
            if (percent !== newPercent) {
                percent = newPercent;
                this.pendingLogs.push(`  Downloading files ${percent}%`);
            }
        });

        this.options.appId = appId;
        this.options.variantId = variantId;
        this.options.versionId = versionId;
        this.options.runtime = version.default_runtime;
        await queueContainerInstall(this, version);

        this.logger.info("Install finished");
    }

    async setConfig() {
        // TODO
    }

    async getConfigs() {
        // TODO
    }

    terminate() {
        this.logger.info("Terminating");
        this.terminated = true;
    }

    async registerWebsocket(ws: WebSocket, userId: string) {
        const daemonConfig = await getDaemonConfig();
        let connections = 0;
        for (const id of this.connectedWebsockets.values()) {
            if (id === userId) {
                connections++;
                if (connections >= daemonConfig.max_websocket_connections_per_container_per_user) {
                    throw new OGSHError("ws/connection-limit", `user id '${userId}' has reached max connections to container id '${this.id}' (limit ${daemonConfig.max_websocket_connections_per_container_per_user})`);
                }
            }
        }
        this.connectedWebsockets.set(ws, userId);
    }

    unregisterWebsocket(ws: WebSocket) {
        this.connectedWebsockets.delete(ws);
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