import Docker from "dockerode";
import { getCredentials } from "./config/credentialsConfig";
import { ContainerCreateOptions } from "./container/container";
import { OGSHError } from "./error";
import { Logger } from "./logger";
import { getMb } from "./utils";

const docker = new Docker({
    socketPath: "/var/run/docker.sock" // TODO this may need to change if the daemon runs in a container
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

export async function pullDockerImage(registryUrl: string, fullImageName: string, logger: Logger) {
	logger.info("Pulling Docker image", {
		image: fullImageName
	});
	await new Promise<void>(async (res, rej) => {
		await docker.pull(fullImageName, {
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
				res();
			}, () => {});
		}).catch(error => {
			rej(new OGSHError("container/image-pull-failed", error));
		});
	});
}

export async function createDockerContainer(options: ContainerCreateOptions): Promise<Docker.Container> {
		const parsedEnvVariables: string[] = [];
        Object.entries(options.environment_variables).forEach(([key, value]) => {
            parsedEnvVariables.push(`${key}=${value}`);
        });

		const dockerCreateOptions: any = { // Use any type because Docker.ContainerCreateOptions doesn't contain HostConfig.NanoCPUs
			Image: options.image,
			OpenStdin: true,
			name: options.name,
			VolumeDriver: "local",
			Env: parsedEnvVariables,
			HostConfig: {
				Memory: getMb(options.memory_mb),
				MemorySwap: getMb(options.memory_mb) + getMb(500),
				NanoCpus: Math.floor(options.max_cpus * 1_000_000_000),
				PortBindings: {},
				Binds: [],
				ReadonlyRootfs: options.container_read_only || false
			},
			ExposedPorts: {}
		};

		if (options.bind_mounts) {
			options.bind_mounts.forEach(options => {
				let readonly = options.readonly ? "ro" : "rw";
				dockerCreateOptions.HostConfig.Binds.push(`${options.host_folder}:${options.container_folder}:${readonly}`);
			});
		}

		if (options.port_mappings) {
			for (const entry of options.port_mappings) {
				dockerCreateOptions.ExposedPorts[`${entry.container_port}/tcp`] = {};
				dockerCreateOptions.ExposedPorts[`${entry.container_port}/udp`] = {};

				dockerCreateOptions.HostConfig.PortBindings[`${entry.container_port}/tcp`] = [{ HostPort: `${entry.host_port}` }];
				dockerCreateOptions.HostConfig.PortBindings[`${entry.container_port}/udp`] = [{ HostPort: `${entry.host_port}` }];
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