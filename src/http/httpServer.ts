import express, { NextFunction, Request, Response } from "express";
import { param } from "express-validator";
import { createServer } from "node:http";
import { getDaemonConfig } from "../config/daemonConfig";
import { formatErrorResponseBody, getErrorHttpStatus, OGSHError } from "../error";
import { Logger } from "../logger";
import { wsServer } from "../ws/wsServer";
import { containerAuthMiddleware } from "./auth/containerAuth";
import { internalAuthMiddleware } from "./auth/internalAuth";
import { userAuthMiddleware } from "./auth/userAuth";
import { containerHttpRouter } from "./routes/containerHttpRoutes";
import { internalHttpRouter } from "./routes/internalHttpRoutes";

export async function initHttpServer(logger: Logger) {
    const daemonConfig = await getDaemonConfig();

    const router = express();
    router.use(express.json());

    router.use("/v1/internal", internalAuthMiddleware, internalHttpRouter);
    router.use("/v1/container/:containerId", param("containerId").isString(), userAuthMiddleware, containerAuthMiddleware, containerHttpRouter);

    router.use((error: Error, req: Request, res: Response, next: NextFunction) => {
        if ((req.method !== "GET" && req.method !== "DELETE") && req.header("content-type") !== "application/json") {
            error = new OGSHError("http/invalid-headers", `missing 'content-type: application/json' header`);
        }

        const responseBody = formatErrorResponseBody(error);
        res.status(getErrorHttpStatus(responseBody.error));
        res.send(responseBody);
    });

    const httpServer = createServer(router);
    httpServer.on("upgrade", async (req, socket, head) => {
        wsServer.handleUpgrade(req, socket, head, (ws) => {
            wsServer.emit("connection", ws, req);
        });
    });

    await new Promise<void>(res => {
        httpServer.listen(daemonConfig.port, () => {
            logger.info(`Started http server on port ${daemonConfig.port}`);
            res();
        });
    });
}