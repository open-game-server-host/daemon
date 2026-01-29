import query from "querystring";
import { WebSocket, WebSocketServer } from "ws";
import { ContainerWrapper, getContainerWrapper } from "../container/container";
import { formatErrorResponseBody, OGSHError } from "../error";

export const wsServer = new WebSocketServer({ noServer: true });

wsServer.on("connection", async (ws, req) => {
    let wrapper: ContainerWrapper | undefined;

    ws.on("close", (code, reason) => {
        wrapper?.unregisterWebsocket(ws);
    });

    ws.on("error", (ws: WebSocket, error: Error) => {
        const responseBody = formatErrorResponseBody(error);
        ws.send(JSON.stringify(responseBody));
    });

    try {
        if (!req.url) {
            throw new OGSHError("ws/invalid-params", `need 'authToken' and 'containerId' url query params`);
        }

        let startIndex = 0;
        for (let i = 0; i < req.url.length; i++) {
            const char = req.url.charAt(i);
            if (char === "?") {
                startIndex = i + 1;
                break;
            }
        }
        const { authToken, containerId } = query.parse(req.url.substring(startIndex));
        if (typeof containerId !== "string") throw new OGSHError("ws/invalid-params", `'containerId' should be a string`);
        // TODO validate containerId length
        const wrapper = getContainerWrapper(containerId as string);
        if (!wrapper) throw new OGSHError("ws/invalid-params", `container id '${containerId}' not registered`);

        if (typeof authToken !== "string") throw new OGSHError("ws/invalid-params", `'authToken' should be a string`);
        // TODO authenticate user

        wrapper.registerWebsocket(ws, authToken); // TODO for now user authToken as userId
    } catch (error) {
        const responseBody = formatErrorResponseBody(error as Error);
        ws.send(JSON.stringify(responseBody));
        ws.close();
    }
});