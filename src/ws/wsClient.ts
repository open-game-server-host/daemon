import { Errors, getApiConfig, Logger, OGSHError, sleep, WsMsg, WsRouter } from "@open-game-server-host/backend-lib";
import { WebSocket } from "ws";
import { getDaemonConfig } from "../config/daemonConfig";
import { ContainerLogsAndStats } from "../container/container";
import { API_KEY, isRunning } from "../daemon";
import { containerWsRouter } from "./routes/containerWsRoutes";
import { systemWsRouter } from "./routes/systemWsRoutes";

const logger = new Logger("WS");
const routers = new Map<string, WsRouter>();
function registerRouter(router: WsRouter) {
    routers.set(router.route, router);
}

registerRouter(containerWsRouter);
registerRouter(systemWsRouter);

let ws: WebSocket | undefined;
export async function connectToApi() {
    while (isRunning()) {
        await new Promise<void>(async res => {
            let { websocketUrl } = await getApiConfig();
            if (!websocketUrl.endsWith("/")) {
                websocketUrl += "/";
            }
            logger.info("Connecting...", {
                websocketUrl
            });

            const encodedUrl = encodeURI(`${websocketUrl}?type=daemon&authToken=${API_KEY}`);
            ws = new WebSocket(encodedUrl);

            ws.onmessage = event => {
                let locals: any = {};
                try {
                    const json = JSON.parse(event.data.toString()) as WsMsg & { error?: string, info?: string };
                    if (json.error) {
                        throw new OGSHError(json.error as Errors, json.info);
                    }
                    if (!json.route) throw new OGSHError("ws/invalid-body", `'route' missing`);
                    if (!json.body) throw new OGSHError("ws/invalid-body", `'body' missing`);
                    if (!json.action) throw new OGSHError("ws/invalid-body", `'action' missing`);

                    const router = routers.get(json.route);
                    if (!router) throw new OGSHError("ws/invalid-route", `router '${json.route}' not found`);

                    router.call(json.action, ws!, json.body, locals, logger);
                } catch (error) {
                    logger.error(error as OGSHError);
                    ws!.close();
                }
            };

            ws.onopen = event => {
                logger.info("Connected", {
                    websocketUrl
                });
            };

            ws.onerror = event => {
                logger.error(event.error);
            };

            ws.onclose = event => {
                logger.info("Connection closed", {
                    code: event.code,
                    reason: event.reason
                });
                res();
            };
        });
        ws = undefined;
        if (isRunning()) {
            const daemonConfig = await getDaemonConfig();
            logger.info(`Reconnecting in ${daemonConfig.websocketReconnectSeconds} seconds`);
            await sleep(daemonConfig.websocketReconnectSeconds * 1000);
        }
    }
}

export async function sendContainerLogsAndStats(containerId: string, logsAndStats: ContainerLogsAndStats) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    ws.send(JSON.stringify({
        route: "container",
        action: "logsAndStats",
        body: {
            containerId,
            logsAndStats
        }
    }));
}

export function disconnectFromApi() {
    ws?.close();
}