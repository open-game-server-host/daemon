import { NextFunction, Request, Response } from "express";
import { Container, getContainer } from "../../container/container";

export interface ContainerAuthLocals {
    container: Container;
}

export async function containerAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    res.locals.container = getContainer(req.params.containerId as string);

    // TODO validate user has access to this container
    next();
}