import { ContainerPort, getVersion, OGSHError, WsRouter } from "@open-game-server-host/backend-lib";
import { WebSocket } from "ws";
import { ContainerWrapper, getContainerWrapper } from "../../container/container";

export const containerWsRouter = new WsRouter("container");

interface ContainerLocals {
    wrapper: ContainerWrapper;
}

interface ContainerBody {
    containerId: string;
}
function validateContainerBody(ws: WebSocket, body: ContainerBody, locals: ContainerLocals) {
    const wrapper = getContainerWrapper(body.containerId);
    if (!wrapper) throw new OGSHError("container/not-found", `container id '${body.containerId}' not registered`);
    locals.wrapper = wrapper;
}

interface ContainerAppBody extends ContainerBody {
    appId: string;
    variantId: string;
    versionId: string;
}
async function validateContainerAppBody(ws: WebSocket, body: ContainerAppBody, locals: ContainerLocals) {
    validateContainerBody(ws, body, locals);
    if (typeof body.appId !== "string") throw new OGSHError("general/unspecified", `'appId' must be a string`);
    if (typeof body.variantId !== "string") throw new OGSHError("general/unspecified", `'variantId' must be a string`);
    if (typeof body.versionId !== "string") throw new OGSHError("general/unspecified", `'versionId' must be a string`);
    const version = await getVersion(body.appId, body.variantId, body.versionId);
    if (!version) throw new OGSHError("app/version-not-found", `could not find app id '${body.appId}' variant id '${body.variantId}' version id '${body.versionId}'`);
}

interface ContainerPortsBody extends ContainerBody {
    ipv4Ports: ContainerPort[];
    ipv6Ports: ContainerPort[];
}
function validateContainerPortsBody(ws: WebSocket, body: ContainerPortsBody, locals: ContainerLocals) {
    validateContainerBody(ws, body, locals);
    if (!Array.isArray(body.ipv4Ports)) throw new OGSHError("general/unspecified", `'ipv4Ports' field must be an array`);
    if (!Array.isArray(body.ipv6Ports)) throw new OGSHError("general/unspecified", `'ipv6Ports' field must be an array`);
    for (const ports of ([] as ContainerPort[]).concat(body.ipv4Ports).concat(body.ipv6Ports)) {
        if (!Number.isInteger(ports.containerPort)) throw new OGSHError("general/unspecified", `'container_port' must be an integer`);
        if (!Number.isInteger(ports.hostPort)) throw new OGSHError("general/unspecified", `'host_port' must be an integer`);
    }
}

export interface ContainerRegisterBody extends ContainerPortsBody {
    appId: string;
    variantId: string;
    versionId: string;
    segments: number;
}
async function validateContainerRegisterBody(ws: WebSocket, body: ContainerRegisterBody, locals: any) {
    if (typeof body.containerId !== "string") throw new OGSHError("general/unspecified", `'containerId' must be a string`);
    validateContainerPortsBody(ws, body, locals);
    await validateContainerAppBody(ws, body, locals);
}
containerWsRouter.register("register", validateContainerRegisterBody, async (ws, body: ContainerRegisterBody, locals: any) => {
    await ContainerWrapper.register(body.containerId, body);
});

containerWsRouter.register("start", validateContainerBody, (ws, body: ContainerBody, locals: ContainerLocals) => {
    locals.wrapper.start();
});

containerWsRouter.register("stop", validateContainerBody, (ws, body: ContainerBody, locals: ContainerLocals) => {
    locals.wrapper.stop();
});

containerWsRouter.register("restart", validateContainerBody, (ws, body: ContainerBody, locals: ContainerLocals) => {
    locals.wrapper.restart();
});

containerWsRouter.register("kill", validateContainerBody, (ws, body: ContainerBody, locals: ContainerLocals) => {
    locals.wrapper.kill();
});

interface ContainerCommandBody extends ContainerBody {
    command: string;
}
function validateContainerCommandBody(ws: WebSocket, body: ContainerCommandBody, locals: ContainerLocals) {
    validateContainerBody(ws, body, locals);
    if (typeof body.command !== "string") throw new OGSHError("general/unspecified", `'command' field must be a string`);
}
containerWsRouter.register("command", validateContainerCommandBody, (ws, body: ContainerCommandBody, locals: ContainerLocals) => {
    locals.wrapper.command(body.command);
});

containerWsRouter.register("install", validateContainerAppBody, (ws, body: ContainerAppBody, locals: ContainerLocals) => {
    locals.wrapper.install(body.appId, body.variantId, body.versionId);
});

containerWsRouter.register("remove", validateContainerBody, (ws, body: ContainerBody, locals: ContainerLocals) => {
    locals.wrapper.terminate();
});

interface ContainerRuntimeBody extends ContainerBody {
    runtime: string;
}
async function validateContainerRuntimeBody(ws: WebSocket, body: ContainerRuntimeBody, locals: ContainerLocals) {
    validateContainerBody(ws, body, locals);
    const { appId, variantId, versionId } = locals.wrapper.getOptions();
    const version = await getVersion(appId, variantId, versionId);
    if (!version) throw new OGSHError("app/version-not-found", `app invalid for container id '${body.containerId}', app id '${appId}' variant id '${variantId}' version id '${versionId}'`);
    if (!version.supportedRuntimes.includes(body.runtime)) throw new OGSHError("general/unspecified", `runtime invalid for container id '${body.containerId}' app id '${appId}' variant id '${variantId}' version id '${versionId}'`);
}
containerWsRouter.register("runtime", validateContainerRuntimeBody, (ws, body: ContainerRuntimeBody, locals: ContainerLocals) => {
    locals.wrapper.updateOptions({
        runtime: body.runtime
    });
});

containerWsRouter.register("ports", validateContainerPortsBody, (ws, body: ContainerPortsBody, locals: ContainerLocals) => {
    locals.wrapper.updateOptions({
        ipv4Ports: body.ipv4Ports,
        ipv6Ports: body.ipv6Ports
    });
});