import { NextFunction, Request, Response } from "express";

export async function internalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    // TODO validate request similar to how github validates webhooks
    next();
}