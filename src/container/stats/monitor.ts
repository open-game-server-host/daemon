import { CPUStats, MemoryStats, NetworkStats } from "dockerode";
import fastFolderSize from "fast-folder-size";
import { ContainerCpu, ContainerMemory, ContainerNetwork, ContainerStorage } from "./containerStats";

export type ContainerCpuMonitor = (totalNanoCpus: number, currentCpu?: CPUStats, previousCpu?: CPUStats) => Promise<ContainerCpu>;
export type ContainerMemoryMonitor = (memory?: MemoryStats) => Promise<ContainerMemory>;
export type ContainerNetworkMonitor = (networks?: NetworkStats) => Promise<ContainerNetwork>;
export type ContainerStorageMonitor = (containerFilesPath: string) => Promise<ContainerStorage>;

export async function defaultContainerCpuMonitor(totalNanoCpus: number, currentCpu?: CPUStats, previousCpu?: CPUStats): Promise<ContainerCpu> {
    if (!currentCpu || !previousCpu) {
        return {
            total: 100,
            used: 0
        }
    }

    const cpuNanosUsage = currentCpu.cpu_usage.total_usage - previousCpu.cpu_usage.total_usage;
    return {
        total: 100,
        // Cap at 100 because sometimes the reported usage goes above 100%
        used: Math.min(100, Math.round(100 / totalNanoCpus * cpuNanosUsage))
    };
}

export async function defaultContainerMemoryMonitor(memory?: MemoryStats): Promise<ContainerMemory> {
    if (!memory) {
        return {
            total: 0,
            used: 0
        }
    }
    return {
        total: memory.limit,
        used: memory.usage
    }
}

export async function defaultContainerNetworkMonitor(networks?: NetworkStats): Promise<ContainerNetwork> {
    if (!networks) {
        return {
            in: 0,
            out: 0
        }
    }

    let netIn = 0;
    let netOut = 0;

    Object.values(networks).forEach(network => {
        netIn += network.rx_bytes;
        netOut += network.tx_bytes;
    });

    return {
        in: netIn,
        out: netOut
    };
}

export async function defaultContainerStorageMonitor(containerFilesPath: string): Promise<ContainerStorage> {
    return new Promise<ContainerStorage>((res, rej) => {
        fastFolderSize(containerFilesPath, (error, bytes) => {
            if (error) {
                console.log(error);
                rej(`failed to get size of folder '${containerFilesPath}'`);
                return;
            }
            if (!bytes) {
                rej(`folder size bytes is undefined (${containerFilesPath})`);
                return;
            }
            res({
                total: 0, // TODO
                used: bytes
            });
        });
    })
}

const cpuMonitors = new Map<string, ContainerCpuMonitor>();
const memoryMonitors = new Map<string, ContainerMemoryMonitor>();
const networkMonitors = new Map<string, ContainerNetworkMonitor>();
const storageMonitors = new Map<string, ContainerStorageMonitor>();

export function getCpuMonitor(runtime: string): ContainerCpuMonitor {
    return cpuMonitors.get(runtime) || defaultContainerCpuMonitor;
}
export function getMemoryMonitor(runtime: string): ContainerMemoryMonitor {
    return memoryMonitors.get(runtime) || defaultContainerMemoryMonitor;
}
export function getNetworkMonitor(runtime: string): ContainerNetworkMonitor {
    return networkMonitors.get(runtime) || defaultContainerNetworkMonitor;
}
export function getStorageMonitor(runtime: string): ContainerStorageMonitor {
    return storageMonitors.get(runtime) || defaultContainerStorageMonitor;
}