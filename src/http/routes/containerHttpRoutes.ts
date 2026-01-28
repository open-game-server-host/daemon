import { Request, Response, Router } from "express";
import { body, check, param } from "express-validator";
import { ContainerAuthLocals } from "../auth/containerAuth";
import { UserAuthLocals } from "../auth/userAuth";

export const containerHttpRouter = Router();

interface ContainerParams {
    containerId: string;
}
type ContainerRequest<Body = any> = Request<ContainerParams, any, Body>;

interface ContainerLocals extends UserAuthLocals, ContainerAuthLocals {}
type ContainerResponse<Body = any> = Response<Body, ContainerLocals>;

containerHttpRouter.post("/start", param("containerId").isString(), async (req: ContainerRequest, res: ContainerResponse) => {
    res.locals.container.start();
    res.send();
});

containerHttpRouter.post("/stop", param("containerId").isString(), async (req: ContainerRequest, res: ContainerResponse) => {
    res.locals.container.stop();
    res.send();
});

containerHttpRouter.post("/restart", param("containerId").isString(), async (req: ContainerRequest, res: ContainerResponse) => {
    res.locals.container.restart();
    res.send();
});

containerHttpRouter.post("/kill", param("containerId").isString(), async (req: ContainerRequest, res: ContainerResponse) => {
    res.locals.container.kill();
    res.send();
});

interface CommandBody {
    command: string;
}
containerHttpRouter.post("/command", param("containerId").isString(), body("command").isString().trim(), async (req: ContainerRequest<CommandBody>, res: ContainerResponse) => {
    res.locals.container.command(req.body.command);
    res.send();
});

interface InstallBody {
    appId: string;
    variantId: string;
    versionId: string;
}
containerHttpRouter.post("/install", param("containerId").isString(), [
    check("appId").isString(),
    check("variantId").isString(),
    check("versionId").isString(),
], async (req: ContainerRequest<InstallBody>, res: ContainerResponse) => {
    res.locals.container.install(req.body.appId, req.body.variantId, req.body.versionId);
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