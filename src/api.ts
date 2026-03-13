import { Container, getApiConfig, OGSHError, UpdateDaemonData } from "@open-game-server-host/backend-lib";
import { API_KEY } from "./daemon";

async function sendApiRequest<T = any>(url: string, path: string, body: any = {}): Promise<T> {
    if (url.endsWith("/")) {
        url = url.substring(0, url.length - 1);
    }
    if (!path.startsWith("/")) {
        path = `/${path}`;
    }

    url = `${url}${path}`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            authorization: API_KEY,
            "content-type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (response.status !== 200) {
        const body = await response.text();
        try {
            const json = JSON.parse(body);
            if (json.error) {
                throw new OGSHError(json.error.error, json.error.info);
            }
        } catch (error) {
        }
        throw new OGSHError("api/request-failed", `failed to send api request to '${url}', status: ${response.status}, status text: ${response.statusText}, body: ${body}`);
    }

    const responseBody = await response.text();
    if (!responseBody.startsWith("{")) {
        return "" as T;
    }
    return JSON.parse(responseBody).data as T;
}

export async function getDaemonContainers(): Promise<Container[]> {
    const { url } = await getApiConfig();
    const containers: Container[] = [];
    let page = 0;
    while (true) {
        const response = await sendApiRequest<{ containers: Container[], resultsPerPage: number }>(url, `/v1/daemon/containers`, {
            page: page++
        });
        response.containers.forEach(container => containers.push(container));
        if (response.containers.length !== response.resultsPerPage) {
            break;
        }
    }
    return containers;
}

export async function updateDaemon(data: UpdateDaemonData) {
    const { url } = await getApiConfig();
    return sendApiRequest(url, `/v1/daemon/update`, data);
}