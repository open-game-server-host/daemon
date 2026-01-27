import { MemoryStats } from "dockerode";
import { getGlobalConfig } from "../../../config/globalConfig";
import { Container as ContainerWrapper, containerEventEmitter } from "../../container";
import { ContainerMemory } from "../containerStats";

const usedMemory = new Map<ContainerWrapper, number>(); // container id, bytes used

containerEventEmitter.on("start", (container: ContainerWrapper) => {
    // TODO start jstat inside the container
    usedMemory.set(container, 0);
});

containerEventEmitter.on("stop", (container: ContainerWrapper) => {
    usedMemory.delete(container);
});

export async function jvmMemoryMonitor(container: ContainerWrapper, memory?: MemoryStats): Promise<ContainerMemory> {
    const globalConfig = await getGlobalConfig();
    return {
        total: (globalConfig.segment.memory_mb * container.getOptions().segments) * 1000000,
        used: usedMemory.get(container) || 0
    };
}