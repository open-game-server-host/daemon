import { NextFunction, Request, Response } from "express";
import { ContainerWrapper, getContainerWrapper } from "../../container/container";
import { OGSHError } from "../../error";

export interface ContainerAuthLocals {
    wrapper: ContainerWrapper;
}

export async function containerAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    res.locals.wrapper = getContainerWrapper(req.params.containerId as string);
    if (!res.locals.wrapper) {
        throw new OGSHError("container/unauthorized", `container id '${req.params.containerId}' not registered`);
    }

    // TODO validate user has access to this container
    next();
}