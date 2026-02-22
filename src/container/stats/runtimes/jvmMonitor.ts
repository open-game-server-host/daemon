import { getGlobalConfig } from "@open-game-server-host/backend-lib";
import Docker, { MemoryStats } from "dockerode";
import Stream from "stream";
import { getDaemonConfig } from "../../../config/daemonConfig";
import { getDockerContainer } from "../../../docker";
import { containerEventEmitter, ContainerWrapper } from "../../container";
import { ContainerMemory } from "../containerStats";

const usedMemory = new Map<ContainerWrapper, number>(); // container id, bytes used

containerEventEmitter.on("stop", (wrapper: ContainerWrapper) => {
    usedMemory.delete(wrapper);
})

export async function jvmMemoryMonitor(wrapper: ContainerWrapper, memory?: MemoryStats): Promise<ContainerMemory> {
    if (!usedMemory.has(wrapper)) {
        usedMemory.set(wrapper, 0);
        const container = await getDockerContainer(wrapper.getContainerId());
        await stopJstat(container);
        const stream = await startJstat(wrapper, container);
        (async (duplex: Stream.Duplex) => {
            const stream = new Stream.PassThrough();
            container.modem.demuxStream(duplex, stream, process.stderr);
            
            let firstOutput = true;
            stream.on("data", chunk => {
                if (firstOutput) {
                    firstOutput = false;
                    return;
                }

                let message = `${chunk}`;
                message = message.trim();
                message = message.replace(/\s\s+/g, " ");
                if (message.length === 0) {
                    return;
                }

                const parts: string[] = message.split(" ");
                const used = Math.ceil((+parts[2] + +parts[3] + +parts[5] + +parts[7] + +parts[9] + +parts[11]) * 1000); // Add all the "usage" values and multiply kilobytes by 1000 to get bytes
                usedMemory.set(wrapper, used);
            });
        })(stream);
    }
    const globalConfig = await getGlobalConfig();
    return {
        total: (globalConfig.segment.memoryMb * wrapper.getOptions().segments) * 1000000,
        used: usedMemory.get(wrapper) || 0
    };
}

async function startJstat(wrapper: ContainerWrapper, container: Docker.Container): Promise<Stream.Duplex> {
    const jvmPid = await wrapper.getContainerPid();
    const daemonConfig = await getDaemonConfig();
    return await new Promise<Stream.Duplex>(res => {
        container.exec({
            AttachStdin: true,
            AttachStdout: true,
            Cmd: [
                "nice",
                "-n",
                "19",
                "jstat",
                "-gc",
                `${jvmPid}`,
                `${daemonConfig.websocket_event_push_frequency_ms}`
            ]
        }).then(exec => {
            res(exec.start({
                stdin: true,
                hijack: true
            }));
        });
    });
}

async function stopJstat(container: Docker.Container) {
    await new Promise<void>(res => {
        container.exec({
            Cmd: ["pkill", "jstat"]
        }).then(exec => {
            exec.start({
                stdin: true,
                hijack: true
            }).then(stream => {
                stream.on("end", res);
            });
        });
    });
}