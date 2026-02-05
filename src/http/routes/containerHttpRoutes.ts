import { Response, Router } from "express";
import { body } from "express-validator";
import { ContainerAuthLocals } from "../auth/containerAuth";
import { UserAuthLocals } from "../auth/userAuth";
import { BodyRequest } from "../httpServer";

export const containerHttpRouter = Router();

interface ContainerParams {
    containerId: string;
}

interface ContainerLocals extends UserAuthLocals, ContainerAuthLocals {}
type ContainerResponse<Body = any> = Response<Body, ContainerLocals>;

containerHttpRouter.post("/start", async (req: BodyRequest<ContainerParams>, res: ContainerResponse) => {
    res.locals.wrapper.start();
    res.send();
});

containerHttpRouter.post("/stop", async (req: BodyRequest<ContainerParams>, res: ContainerResponse) => {
    res.locals.wrapper.stop();
    res.send();
});

containerHttpRouter.post("/restart", async (req: BodyRequest<ContainerParams>, res: ContainerResponse) => {
    res.locals.wrapper.restart();
    res.send();
});

containerHttpRouter.post("/kill", async (req: BodyRequest<ContainerParams>, res: ContainerResponse) => {
    res.locals.wrapper.kill();
    res.send();
});

interface CommandBody {
    command: string;
}
containerHttpRouter.post("/command", body("command").isString().trim(), async (req: BodyRequest<CommandBody>, res: ContainerResponse) => {
    res.locals.wrapper.command(req.body.command);
    res.send();
});

containerHttpRouter.post("/:containerId/config", async (req: BodyRequest<ContainerParams>, res: ContainerResponse) => {
    console.log("TODO");
    res.send();
});

containerHttpRouter.get("/:containerId/config", async (req: BodyRequest<ContainerParams>, res: ContainerResponse) => {
    console.log("TODO");
    res.send();
});