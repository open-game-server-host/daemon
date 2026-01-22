import { NextFunction, Request, Response } from "express";

export interface ContainerAuthLocals {
    
}

export async function containerAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    // TODO validate user has access to this container
    next();
}