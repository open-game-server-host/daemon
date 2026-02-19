import { ContainerPort, OGSHError, respond } from "@open-game-server-host/backend-lib";
import { Request, Response, Router } from "express";
import { body, check, param } from "express-validator";
import { ContainerWrapper, ContainerWrapperOptions, getContainerWrapper, getContainerWrappers, validateContainerApp } from "../../container/container";
import { BodyRequest } from "../httpServer";

export const internalHttpRouter = Router();

function getContainer(containerId: string): ContainerWrapper {
    const wrapper = getContainerWrapper(containerId);
    if (!wrapper) {
        throw new OGSHError("container/not-found", `container id '${containerId}' is not registered`);
    }
    return wrapper;
}

// User has just purchased an app/game, create the container
internalHttpRouter.post("/container/:containerId", param("containerId").isString(), async (req: BodyRequest<ContainerWrapperOptions>, res) => {
    const wrapper = await ContainerWrapper.register(req.params.containerId, req.body);
    wrapper.install(req.body.app_id, req.body.variant_id, req.body.version_id);
    res.send();
});

interface InstallBody {
    appId: string;
    variantId: string;
    versionId: string;
}
internalHttpRouter.post("/container/:containerId/install", [
    check("appId").isString(),
    check("variantId").isString(),
    check("versionId").isString(),
], async (req: BodyRequest<InstallBody>, res: Response) => {
    const { appId, variantId, versionId } = req.body;
    await validateContainerApp(appId, variantId, versionId);
    getContainer(req.params.containerId).install(appId, variantId, versionId);
    res.send();
});

interface RuntimeBody {
    dockerImage: string;
}
internalHttpRouter.post("/container/:containerId/image", [
    param("containerId").isString(),
    body("dockerImage").isString()
], async (req: BodyRequest<RuntimeBody>, res: Response) => {
    getContainer(req.params.containerId).getOptions().runtime = req.body.dockerImage;
    res.send();
});

interface PortsBody {
    ports: ContainerPort[];
}
internalHttpRouter.post("/container/:containerId/ports", [
    param("ports").isArray().customSanitizer((input, meta) => {
        for (const ports of (input as ContainerPort[])) {
            if (typeof ports !== "object") throw new OGSHError("general/unspecified");
            const { container_port, host_port } = ports;
            if (!Number.isInteger(container_port) || container_port < 0 || container_port > 65535) throw new OGSHError("general/unspecified");
            if (!Number.isInteger(host_port) || host_port < 0 || host_port > 65535) throw new OGSHError("general/unspecified");
        }
    })
], (req: BodyRequest<PortsBody>, res: Response) => {
    getContainer(req.params.containerId).getOptions().ports = req.body.ports;
    res.send();
});

internalHttpRouter.post("/stopallcontainers", (req, res) => {
    getContainerWrappers().forEach(wrapper => wrapper.stop());
    res.send();
});

internalHttpRouter.post("/container/:containerId/start", param("containerId").isString(), async (req, res) => {
    getContainer(req.params!.containerId).start();
    respond(res);
});

internalHttpRouter.post("/container/:containerId/stop", param("containerId").isString(), async (req, res) => {
    getContainer(req.params!.containerId).stop();
    respond(res);
});

internalHttpRouter.post("/container/:containerId/restart", param("containerId").isString(), async (req, res) => {
    getContainer(req.params!.containerId).restart();
    respond(res);
});

internalHttpRouter.post("/container/:containerId/kill", param("containerId").isString(), async (req, res) => {
    getContainer(req.params!.containerId).kill();
    respond(res);
});

interface ContainerCommandBody {
    command: string;
}
internalHttpRouter.post("/container/:containerId/command", [
    param("containerId").isString(),
    body("command").isString()
], async (req: BodyRequest<ContainerCommandBody>, res: Response) => {
    getContainer(req.params.containerId).command(req.body.command);
    respond(res);
});

internalHttpRouter.post("/container/:containerId/terminate", [
    param("containerId").isString()
], async (req: Request, res: Response) => {
    getContainer(req.params.containerId as string).terminate();
    respond(res);
});