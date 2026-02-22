import { Errors, getApiConfig, Logger, OGSHError, sleep, WsMsg, WsRouter } from "@open-game-server-host/backend-lib";
import { WebSocket } from "ws";
import { getDaemonApiKey, getDaemonId } from "../env";
import { containerWsRouter } from "./routes/containerWsRoutes";
import { systemWsRouter } from "./routes/systemWsRoutes";

const RECONNECT_WAIT_SECONDS = 3; // TODO move this to config

const logger = new Logger("WS");
const routers = new Map<string, WsRouter>();
function registerRouter(router: WsRouter) {
    routers.set(router.route, router);
}

registerRouter(containerWsRouter);
registerRouter(systemWsRouter);

export async function connectToApi() {
    // TODO while (isRunning())
    while (true) {
        await new Promise<void>(async res => {
            let { websocketUrl } = await getApiConfig();
            if (!websocketUrl.endsWith("/")) {
                websocketUrl += "/";
            }
            logger.info("Connecting...", {
                websocketUrl
            });

            const encodedUrl = encodeURI(`${websocketUrl}?type=daemon&id=${getDaemonId()}&authToken=${getDaemonApiKey()}`)
            const ws = new WebSocket(encodedUrl);

            ws.onmessage = event => {
                let locals: any = {};
                try {
                    const json = JSON.parse(event.data.toString()) as WsMsg & { error?: string, info?: string };
                    if (json.error) {
                        throw new OGSHError(json.error as Errors, json.info);
                    }
                    if (!json.route) throw new OGSHError("general/unspecified", `'route' missing`);
                    if (!json.body) throw new OGSHError("general/unspecified", `'body' missing`);
                    if (!json.action) throw new OGSHError("general/unspecified", `'action' missing`);

                    const router = routers.get(json.route);
                    if (!router) throw new OGSHError("general/unspecified", `router '${json.route}' not found`);

                    router.call(json.action, ws, json.body, locals);
                } catch (error) {
                    logger.error(error as OGSHError);
                    ws.close();
                }
            };

            ws.onopen = event => {
                logger.info("Connected", {
                    websocketUrl
                });
            };

            ws.onerror = event => {
                logger.info(`Connection failed, retrying in ${RECONNECT_WAIT_SECONDS} seconds`);
            };

            ws.onclose = event => {
                logger.info("Connection closed");
                res();
            };
        });
        await sleep(RECONNECT_WAIT_SECONDS * 1000);
    }
}