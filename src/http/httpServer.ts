import { expressErrorHandler, Logger } from "@open-game-server-host/backend-lib";
import express from "express";
import { param } from "express-validator";
import { createServer } from "node:http";
import { getDaemonConfig } from "../config/daemonConfig";
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

    router.use(expressErrorHandler);

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