import express, { NextFunction, Request, Response } from "express";
import { getAppDaemonConfig } from "../config/appDaemonConfig";
import { internalHttpRouter } from "./routes/internalHttpRoutes";

export async function initHttpServer() {
    const daemonConfig = await getAppDaemonConfig();

    const app = express();
    app.use(express.json());

    app.use("/v1/internal", internalHttpRouter);

    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        // TODO
    });

    app.listen(daemonConfig.port, () => {
        console.log(`Started express on port ${daemonConfig.port}`);
    });
}