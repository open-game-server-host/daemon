import { getMb, Logger, OGSHError, sleep } from "@open-game-server-host/backend-lib";
import Docker from "dockerode";
import { getCredentials } from "./config/credentialsConfig";
import { ContainerCreateOptions } from "./container/container";

const docker = new Docker({
    socketPath: "/var/run/docker.sock"
});

export async function getDockerContainers(): Promise<Docker.ContainerInfo[]> {
    return docker.listContainers();
}

function getContainer(container: string | Docker.Container) {
    let c: Docker.Container;
    if (typeof container === "string") {
        c = docker.getContainer(container);
    } else {
        c = container;
    }
	return c;
}

export async function getDockerContainer(containerId: string): Promise<Docker.Container> {
    const container = getContainer(containerId);
    if (!await doesDockerContainerExist(container)) {
		throw new OGSHError("container/not-found", `id '${containerId}'`);
    }
    return container;
}

export async function doesDockerContainerExist(container: string | Docker.Container): Promise<boolean> {
    return await getContainer(container).inspect().then(() => true).catch(() => false);
}

export async function isDockerContainerRunning(container: string | Docker.Container): Promise<boolean> {
	return await getContainer(container).inspect().then(info => info.State.Running).catch(error => false);
}

interface DockerPullPromise {
	res: () => void;
	rej: (reason?: any) => void;
}
const pullPromises = new Map<string, DockerPullPromise[]>();
export async function pullDockerImage(registryUrl: string, fullImageName: string, logger: Logger) {
	let pull = !pullPromises.has(fullImageName);

	const promise = new Promise<void>((res, rej) => {
		const promises = pullPromises.get(fullImageName) || [];
		promises.push({
			res,
			rej
		});
		pullPromises.set(fullImageName, promises);
	});

	if (pull) {
		docker.pull(fullImageName, {
			authconfig: {
				username: getCredentials().github_packages_read_username,
				password: getCredentials().github_packages_read_token,
				serveraddress: registryUrl
			}
		}).then(stream => {
			docker.modem.followProgress(stream, error => {
				if (error) {
					throw new OGSHError("container/image-pull-failed", error);
				}
				logger.info("Finished pulling Docker image", {
					image: fullImageName
				});
				pullPromises.get(fullImageName)!.forEach(promise => promise.res());
				pullPromises.delete(fullImageName);
			}, () => {});
		}).catch(error => {
			pullPromises.get(fullImageName)!.forEach(promise => promise.rej(new OGSHError("container/image-pull-failed", error)));
			pullPromises.delete(fullImageName);
		});
	}

	return promise;
}

export async function createDockerContainer(options: ContainerCreateOptions): Promise<Docker.Container> {
		const parsedEnvVariables: string[] = [];
        Object.entries(options.environmentVariables).forEach(([key, value]) => {
            parsedEnvVariables.push(`${key}=${value}`);
        });

		const dockerCreateOptions: any = { // Use any type because Docker.ContainerCreateOptions doesn't contain HostConfig.NanoCPUs
			Image: options.image,
			OpenStdin: true,
			name: options.name,
			VolumeDriver: "local",
			Env: parsedEnvVariables,
			HostConfig: {
				Memory: getMb(options.memoryMb),
				MemorySwap: getMb(options.memoryMb) + getMb(500),
				NanoCpus: Math.floor(options.maxCpus * 1_000_000_000),
				PortBindings: {},
				Binds: [],
				ReadonlyRootfs: options.containerReadOnly || false
			},
			ExposedPorts: {}
		};

		if (options.bindMounts) {
			options.bindMounts.forEach(options => {
				let readonly = options.readonly ? "ro" : "rw";
				dockerCreateOptions.HostConfig.Binds.push(`${options.host_folder}:${options.container_folder}:${readonly}`);
			});
		}

		if (options.ipv4PortMappings) {
			for (const entry of options.ipv4PortMappings) {
				dockerCreateOptions.ExposedPorts[`${entry.containerPort}/tcp`] = {};
				dockerCreateOptions.ExposedPorts[`${entry.containerPort}/udp`] = {};

				dockerCreateOptions.HostConfig.PortBindings[`${entry.containerPort}/tcp`] = [{ HostIp: "0.0.0.0", HostPort: `${entry.hostPort}` }];
				dockerCreateOptions.HostConfig.PortBindings[`${entry.containerPort}/udp`] = [{ HostIp: "0.0.0.0", HostPort: `${entry.hostPort}` }];
			}
		}

		if (options.ipv6PortMappings) {
			for (const entry of options.ipv6PortMappings) {
				dockerCreateOptions.ExposedPorts[`${entry.containerPort}/tcp`] = {};
				dockerCreateOptions.ExposedPorts[`${entry.containerPort}/udp`] = {};

				dockerCreateOptions.HostConfig.PortBindings[`${entry.containerPort}/tcp`] = [{ HostIp: "::/0", HostPort: `${entry.hostPort}` }];
				dockerCreateOptions.HostConfig.PortBindings[`${entry.containerPort}/udp`] = [{ HostIp: "::/0", HostPort: `${entry.hostPort}` }];
			}
		}

		if (options.network) {
			let networkName: string;
			if (typeof options.network === "string") {
				networkName = options.network;
			} else {
				networkName = (await options.network.inspect()).Name as string;
			}
			dockerCreateOptions.HostConfig.NetworkMode = networkName;
		}

		return await docker.createContainer(dockerCreateOptions).catch(error => {
			throw new OGSHError("container/create-failed", error);
		});
}

export async function removeDockerContainer(containerId: string) {
    const container = getContainer(containerId);
    await container.remove({
        force: true, // Kill container before removing it
        v: true // Remove anonymous volumes
    }).catch(_ => {});
}

// TODO test whether this is necessary
let containerStartQueue: { container: Docker.Container, finish: (value: any) => void }[] | undefined;
export async function startDockerContainer(container: Docker.Container): Promise<any> {
	let processQueue = false;
	if (!containerStartQueue) {
		containerStartQueue = [];
		processQueue = true;
	}
	const promise = new Promise<any>(res => {
		containerStartQueue!.push({
			container,
			finish: res
		});
	});
	if (processQueue) {
		(async () => {
			do {
				const containerToStart = containerStartQueue.shift();
				if (containerToStart) {
					containerToStart.finish(await containerToStart.container.start());
					await sleep(250);
				}
			} while (containerStartQueue.length > 0);
			containerStartQueue = undefined;
		})();
	}
	return promise;
}