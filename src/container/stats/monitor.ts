import { getGlobalConfig } from "@open-game-server-host/backend-lib";
import { CPUStats, MemoryStats, NetworkStats } from "dockerode";
import fastFolderSize from "fast-folder-size";
import { existsSync } from "node:fs";
import { ContainerWrapper } from "../container";
import { ContainerCpu, ContainerMemory, ContainerNetwork, ContainerStorage } from "./containerStats";
import { jvmMemoryMonitor as jvmContainerMemorymonitor } from "./runtimes/jvmMonitor";

export type ContainerCpuMonitor = (wrapper: ContainerWrapper, totalNanoCpus: number, currentCpu?: CPUStats, previousCpu?: CPUStats) => Promise<ContainerCpu>;
export type ContainerMemoryMonitor = (wrapper: ContainerWrapper, memory?: MemoryStats) => Promise<ContainerMemory>;
export type ContainerNetworkMonitor = (wrapper: ContainerWrapper, networks?: NetworkStats) => Promise<ContainerNetwork>;
export type ContainerStorageMonitor = (wrapper: ContainerWrapper, containerFilesPath: string) => Promise<ContainerStorage>;

export async function defaultContainerCpuMonitor(wrapper: ContainerWrapper, totalNanoCpus: number, currentCpu?: CPUStats, previousCpu?: CPUStats): Promise<ContainerCpu> {
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
        used: Math.min(100, Math.ceil(100 / totalNanoCpus * cpuNanosUsage))
    };
}

export async function defaultContainerMemoryMonitor(wrapper: ContainerWrapper, memory?: MemoryStats): Promise<ContainerMemory> {
    const globalConfig = await getGlobalConfig();
    const total = globalConfig.segment.memory_mb * wrapper.getOptions().segments * 1_000_000;
    if (!memory) {
        return {
            total,
            used: 0
        }
    }
    return {
        total,
        used: memory.usage
    }
}

export async function defaultContainerNetworkMonitor(wrapper: ContainerWrapper, networks?: NetworkStats): Promise<ContainerNetwork> {
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

export async function defaultContainerStorageMonitor(wrapper: ContainerWrapper, containerFilesPath: string): Promise<ContainerStorage> {
    const globalConfig = await getGlobalConfig();
    const total = (globalConfig.segment.storage_gb * wrapper.getOptions().segments) * 1_000_000_000;

    if (!existsSync(containerFilesPath)) {
        return {
            total,
            used: 0
        }
    }

    return new Promise<ContainerStorage>((res, rej) => {
        fastFolderSize(containerFilesPath, (error, bytes) => {
            if (error) {
                console.log(error);
                rej(`failed to get size of folder '${containerFilesPath}'`);
                return;
            }
            if (!bytes) {
                // Folder was probably deleted due to reinstall
                bytes = 0;
            }
            res({
                total,
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

memoryMonitors.set("jvm", jvmContainerMemorymonitor);