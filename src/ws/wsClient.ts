import { formatErrorResponseBody, Logger, OGSHError, WsMsg, WsRouter } from "@open-game-server-host/backend-lib";
import { WebSocket } from "ws";
import { getDaemonApiKey, getDaemonId } from "../env";
import { containerWsRouter } from "./routes/containerWsRoutes";
import { systemWsRouter } from "./routes/systemWsRoutes";

const routers = new Map<string, WsRouter>();
function registerRouter(router: WsRouter) {
    routers.set(router.route, router);
}

registerRouter(containerWsRouter);
registerRouter(systemWsRouter);

export async function connectToApi(wsUrl: string) {
    const logger = new Logger("WS");
    logger.info("Connecting to API", {
        wsUrl
    });

    if (!wsUrl.endsWith("/")) {
        wsUrl += "/";
    }
    wsUrl += `?daemonId=${getDaemonId()}&authToken=${getDaemonApiKey()}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = event => {
        logger.info("Connected", {
            wsUrl
        });
    };

    ws.onclose = event => {
        // TODO
        logger.info("CLOSED - TODO ATTEMPT RECONNECT EVERY FEW SECONDS");
    };

    ws.onerror = event => {
        // TODO
        logger.info(`ERROR, event:`);
        console.log(JSON.stringify(event, null, 2));
    };

    ws.onmessage = event => {
        let locals: any = {};
        try {
            const json = JSON.parse(`${event.data}`) as WsMsg;
            if (!json.route) throw new OGSHError("general/unspecified", `'route' missing`);
            if (!json.body) throw new OGSHError("general/unspecified", `'body' missing`);
            if (!json.action) throw new OGSHError("general/unspecified", `'action' missing`);

            const router = routers.get(json.route);
            if (!router) throw new OGSHError("general/unspecified", `router '${json.route}' not found`);

            router.call(json.action, ws, json.body, locals);
        } catch (error) {
            const body = formatErrorResponseBody(error as Error);
            ws.send(JSON.stringify(body));
        }
    };
}