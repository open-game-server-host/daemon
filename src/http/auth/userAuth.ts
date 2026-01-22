import { NextFunction, Request, Response } from "express";

export interface UserAuthLocals {
    userId: string;
}

export async function userAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    // TODO validate user
    next();
}