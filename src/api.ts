import { Container, getApiConfig, OGSHError } from "@open-game-server-host/backend-lib";
import { API_KEY } from "./daemon";

async function sendApiRequest<T>(url: string, path: string, body: any = {}): Promise<T> {
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
        throw new OGSHError("general/unspecified", `failed to send api request to '${url}', status: ${response.status}, status text: ${response.statusText}, body: ${body}`);
    }

    return (await response.json()).data as T;
}

export async function getDaemonContainers(): Promise<Container[]> {
    const { url } = await getApiConfig();
    return sendApiRequest<Container[]>(url, `/v1/daemon/containers`);
}