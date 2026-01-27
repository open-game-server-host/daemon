import express, { NextFunction, Request, Response } from "express";
import { param } from "express-validator";
import { getDaemonConfig } from "../config/daemonConfig";
import { getErrorHttpStatus, OGSHError } from "../error";
import { Logger } from "../logger";
import { containerAuthMiddleware } from "./auth/containerAuth";
import { internalAuthMiddleware } from "./auth/internalAuth";
import { userAuthMiddleware } from "./auth/userAuth";
import { containerHttpRouter } from "./routes/containerHttpRoutes";
import { internalHttpRouter } from "./routes/internalHttpRoutes";

export async function initHttpServer(logger: Logger) {
    const daemonConfig = await getDaemonConfig();

    const app = express();
    app.use(express.json());

    app.use("/v1/internal", internalAuthMiddleware, internalHttpRouter);
    app.use("/v1/container/:containerId", param("containerId").isString(), userAuthMiddleware, containerAuthMiddleware, containerHttpRouter);

    app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
        const responseBody: any = {};
        if (error instanceof OGSHError) {
            responseBody.error = (error as OGSHError).ogshError;
        } else {
            responseBody.error = "general/unspecified";
        }
        responseBody.info = error.message; // TODO only display this in dev environments
        res.status(getErrorHttpStatus(responseBody.error));
        res.send(responseBody);
    });

    await new Promise<void>(res => {
        app.listen(daemonConfig.port, () => {
            logger.info(`Started express on port ${daemonConfig.port}`);
            res();
        });
    });
}