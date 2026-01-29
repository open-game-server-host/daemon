import { validateInternalRequest } from "@open-game-server-host/backend-lib";
import { NextFunction, Request, Response } from "express";

export async function internalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    await validateInternalRequest(req);
    next();
}