import { getUserIdFromAuthToken, OGSHError } from "@open-game-server-host/backend-lib";
import { NextFunction, Request, Response } from "express";

export interface UserAuthLocals {
    userId: string;
}

export async function userAuthMiddleware(req: Request, res: Response<any, UserAuthLocals>, next: NextFunction) {
    const bearer = req.headers.authorization;
    if (!bearer) {
        throw new OGSHError("auth/invalid", `missing 'Authorization: Bearer ...' header`);
    }

    const token = bearer.substring(7);
    res.locals.userId = await getUserIdFromAuthToken(token);
    next();
}