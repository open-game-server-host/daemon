import { OGSHError } from "@open-game-server-host/backend-lib";
import { Response, Router } from "express";
import { body, check, param } from "express-validator";
import { ContainerPort, ContainerWrapper, ContainerWrapperOptions } from "../../container/container";
import { BodyRequest } from "../httpServer";

export const internalHttpRouter = Router();

function getContainerWrapper(containerId: string): ContainerWrapper {
    const wrapper = getContainerWrapper(containerId);
    if (!wrapper) {
        throw new OGSHError("container/not-found", `container id '${containerId}' is not registered`);
    }
    return wrapper;
}

// User has just purchased an app/game, create the container
internalHttpRouter.post("/container/:containerId", param("containerId").isString(), async (req: BodyRequest<ContainerWrapperOptions>, res) => {
    await ContainerWrapper.register(req.params.containerId, req.body);
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
    getContainerWrapper(req.params.containerId).install(req.body.appId, req.body.variantId, req.body.versionId);
    res.send();
});

interface RuntimeBody {
    dockerImage: string;
}
internalHttpRouter.post("/container/:containerId/image", [
    param("containerId").isString(),
    body("dockerImage").isString()
], async (req: BodyRequest<RuntimeBody>, res: Response) => {
    getContainerWrapper(req.params.containerId).getOptions().dockerImage = req.body.dockerImage;
    res.send();
});

interface PortsBody {
    ports: ContainerPort[];
}
internalHttpRouter.post("/container/:containerId/ports", [
    param("ports").isArray().customSanitizer((input, meta) => {
        for (const ports of (input as ContainerPort[])) {
            if (typeof ports !== "object") throw new OGSHError("general/unspecified");
            const containerPort = +ports.containerPort;
            if (!Number.isInteger(containerPort) || containerPort < 0 || containerPort > 65535) throw new OGSHError("general/unspecified");
            const hostPort = +ports.hostPort;
            if (!Number.isInteger(hostPort) || hostPort < 0 || hostPort > 65535) throw new OGSHError("general/unspecified");
        }
    })
], (req: BodyRequest<PortsBody>, res: Response) => {
    getContainerWrapper(req.params.containerId).getOptions().ports = req.body.ports;
    res.send();
});