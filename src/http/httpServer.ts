import express, { NextFunction, Request, Response } from "express";
import { getDaemonConfig } from "../config/daemonConfig";
import { containerAuthMiddleware } from "./auth/containerAuth";
import { internalAuthMiddleware } from "./auth/internalAuth";
import { userAuthMiddleware } from "./auth/userAuth";
import { containerHttpRouter } from "./routes/containerHttpRoutes";
import { internalHttpRouter } from "./routes/internalHttpRoutes";

export async function initHttpServer() {
    const daemonConfig = await getDaemonConfig();

    const app = express();
    app.use(express.json());

    app.use("/v1/internal", internalAuthMiddleware, internalHttpRouter);
    app.use("/v1/container", userAuthMiddleware, containerAuthMiddleware, containerHttpRouter);

    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        // TODO
    });

    app.listen(daemonConfig.port, () => console.log(`Started express on port ${daemonConfig.port}`));
}