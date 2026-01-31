import { OGSHError } from "@open-game-server-host/backend-lib";
import { Router } from "express";
import { param } from "express-validator";
import { ContainerWrapper, ContainerWrapperOptions, getContainerWrapper } from "../../container/container";
import { BodyRequest } from "../httpServer";

export const internalHttpRouter = Router();

// User has just purchased an app/game, create the container
internalHttpRouter.post("/container/:containerId", param("containerId").isString(), async (req: BodyRequest<ContainerWrapperOptions>, res) => {
    await ContainerWrapper.register(req.params!.containerId, req.body);
});

// interface RuntimeBody {
//     runtime: string;
//     runtimeImage: string;
// }
// internalHttpRouter.post("/container/:containerId/runtime", [
//     param("containerId").isString(),
//     body("runtime").isString(),
//     body("runtimeImage").isString()
// ], async (req: BodyRequest<RuntimeBody>, res: Response) => {
//     const container = getContainerWrapper(req.params!.containerId);
//     if (!container) {
//         throw new OGSHError("container/not-found", `could not find container id '' to set runtime to '${}'`);
//     }
//     container.getOptions().runtime = req.body.runtime;
// });

internalHttpRouter.post("/container/:containerId/config", param("containerId").isString(), async (req: BodyRequest<Partial<ContainerWrapperOptions>>, res) => {
    const container = getContainerWrapper(req.params!.containerId);
    if (!container) {
        throw new OGSHError("container/not-found", `could not update options for unregistered container id '${req.params!.containerId}'`);
    }
    await container.updateOptions(req.body);
});