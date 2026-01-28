import { Request, Response, Router } from "express";
import { body, check } from "express-validator";
import { ContainerAuthLocals } from "../auth/containerAuth";
import { UserAuthLocals } from "../auth/userAuth";

export const containerHttpRouter = Router();

interface ContainerParams {
    containerId: string;
}
type ContainerRequest<Body = any> = Request<ContainerParams, any, Body>;

interface ContainerLocals extends UserAuthLocals, ContainerAuthLocals {}
type ContainerResponse<Body = any> = Response<Body, ContainerLocals>;

containerHttpRouter.post("/start", async (req: ContainerRequest, res: ContainerResponse) => {
    res.locals.wrapper.start();
    res.send();
});

containerHttpRouter.post("/stop", async (req: ContainerRequest, res: ContainerResponse) => {
    res.locals.wrapper.stop();
    res.send();
});

containerHttpRouter.post("/restart", async (req: ContainerRequest, res: ContainerResponse) => {
    res.locals.wrapper.restart();
    res.send();
});

containerHttpRouter.post("/kill", async (req: ContainerRequest, res: ContainerResponse) => {
    res.locals.wrapper.kill();
    res.send();
});

interface CommandBody {
    command: string;
}
containerHttpRouter.post("/command", body("command").isString().trim(), async (req: ContainerRequest<CommandBody>, res: ContainerResponse) => {
    res.locals.wrapper.command(req.body.command);
    res.send();
});

interface InstallBody {
    appId: string;
    variantId: string;
    versionId: string;
}
containerHttpRouter.post("/install", [
    check("appId").isString(),
    check("variantId").isString(),
    check("versionId").isString(),
], async (req: ContainerRequest<InstallBody>, res: ContainerResponse) => {
    res.locals.wrapper.install(req.body.appId, req.body.variantId, req.body.versionId);
    res.send();
});

containerHttpRouter.post("/:containerId/config", async (req: ContainerRequest, res: ContainerResponse) => {
    console.log("TODO");
    res.send();
});

containerHttpRouter.get("/:containerId/config", async (req: ContainerRequest, res: ContainerResponse) => {
    console.log("TODO");
    res.send();
});