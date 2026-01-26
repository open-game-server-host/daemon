export interface ContainerStats {
	cpu: ContainerCpu;
	memory: ContainerMemory;
	network: ContainerNetwork;
	storage: ContainerStorage;
	online: boolean;
	timestamp: number; // Unix time in milliseconds
	sessionLength: number; // Unix time in milliseconds that the container has been online, or 0 if it's offline
}

export interface ContainerCpu {
	used: number;
	total: number;
}

export interface ContainerMemory {
	used: number;
	total: number;
}

export interface ContainerNetwork {
	in: number;
	out: number;
}

export interface ContainerStorage {
	used: number;
	total: number;
}