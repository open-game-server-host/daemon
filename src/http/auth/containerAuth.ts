import { NextFunction, Request, Response } from "express";
import { ContainerWrapper, getContainerWrapper } from "../../container/container";

export interface ContainerAuthLocals {
    wrapper: ContainerWrapper;
}

export async function containerAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    res.locals.wrapper = getContainerWrapper(req.params.containerId as string);

    // TODO validate user has access to this container
    next();
}