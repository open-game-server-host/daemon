import { Request, Response, Router } from "express";
import { body, check, param } from "express-validator";
import { getContainer } from "../../container/container";
import { ContainerAuthLocals } from "../auth/containerAuth";
import { UserAuthLocals } from "../auth/userAuth";

export const containerHttpRouter = Router();

interface ContainerParams {
    containerId: string;
}
type ContainerRequest<Body = any> = Request<ContainerParams, any, Body>;

interface ContainerLocals extends UserAuthLocals, ContainerAuthLocals {}
type ContainerResponse<Body = any> = Response<Body, ContainerLocals>;

containerHttpRouter.post("/:containerId/start", param("containerId").isString(), async (req: ContainerRequest, res: ContainerResponse) => {
    const container = getContainer(req.params.containerId);
    if (container) {
        container.start();
    } else {
        throw new Error("TODO");
    }
    res.send();
});

containerHttpRouter.post("/:containerId/stop", param("containerId").isString(), async (req: ContainerRequest, res: ContainerResponse) => {
    const container = getContainer(req.params.containerId);
    if (container) {
        container.stop();
    } else {
        throw new Error("TODO");
    }
    res.send();
});

containerHttpRouter.post("/:containerId/restart", param("containerId").isString(), async (req: ContainerRequest, res: ContainerResponse) => {
    const container = getContainer(req.params.containerId);
    if (container) {
        container.restart();
    } else {
        throw new Error("TODO");
    }
    res.send();
});

containerHttpRouter.post("/:containerId/kill", param("containerId").isString(), async (req: ContainerRequest, res: ContainerResponse) => {
    const container = getContainer(req.params.containerId);
    if (container) {
        container.kill();
    } else {
        throw new Error("TODO");
    }
    res.send();
});

interface CommandBody {
    command: string;
}
containerHttpRouter.post("/:containerId/command", param("containerId").isString(), body("command").isString().trim(), async (req: ContainerRequest<CommandBody>, res: ContainerResponse) => {
    const container = getContainer(req.params.containerId);
    if (container) {
        container.command(req.body.command);
    } else {
        throw new Error("TODO");
    }
    res.send();
});

interface InstallBody {
    appId: string;
    variantId: string;
    versionId: string;
}
containerHttpRouter.post("/:containerId/install", param("containerId").isString(), [
    check("appId").isString(),
    check("variantId").isString(),
    check("versionId").isString(),
], async (req: ContainerRequest<InstallBody>, res: ContainerResponse) => {
    const container = getContainer(req.params.containerId);
    if (container) {
        container.install(req.body.appId, req.body.variantId, req.body.versionId);
    } else {
        throw new Error("TODO");
    }
    res.send();
});

containerHttpRouter.post("/:containerId/config", param("containerId").isString(), async (req: ContainerRequest, res: ContainerResponse) => {
    console.log("TODO");
    res.send();
});

containerHttpRouter.get("/:containerId/config", param("containerId").isString(), async (req: ContainerRequest, res: ContainerResponse) => {
    console.log("TODO");
    res.send();
});