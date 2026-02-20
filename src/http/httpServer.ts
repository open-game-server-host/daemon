import { expressErrorHandler, internalAuthMiddleware, Logger } from "@open-game-server-host/backend-lib";
import express, { Request } from "express";
import { createServer } from "node:http";
import { getDaemonConfig } from "../config/daemonConfig";
import { wsServer } from "../ws/wsServer";
import { internalHttpRouter } from "./routes/internalHttpRoutes";

export async function initHttpServer(logger: Logger) {
    const daemonConfig = await getDaemonConfig();

    const router = express();
    router.use(express.json());

    // TODO split this up into multiple routers: daemon, container, files, systemn
    router.use("/v1/internal", internalAuthMiddleware, internalHttpRouter);

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

export type BodyRequest<Body = any> = Request<any, any, Body>;