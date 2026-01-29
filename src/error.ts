import { HTTPStatus } from "./http/httpStatus";

export type Errors =
    | "general/unspecified"

    | "config/download-failed"

    | "container/not-found"
    | "container/image-pull-failed"
    | "container/create-failed"
    | "container/terminated"
    | "container/invalid"
    | "container/offline"
    | "container/command-failed"
    | "container/cpu-monitor-failed"
    | "container/memory-monitor-failed"
    | "container/network-monitor-failed"
    | "container/storage-monitor-failed"
    | "container/pid-not-found"
    | "container/unauthorized"

    | "app/not-found"
    | "app/variant-not-found"
    | "app/version-not-found"
    | "app/startup-files-not-found"

    | "ws/invalid-params"
    | "ws/connection-limit"

    | "http/invalid-headers"

    | "auth/invalid"
;

const httpErrors = new Map<Errors, number>();
httpErrors.set("general/unspecified", HTTPStatus.SERVER_ERROR);

export class OGSHError extends Error {
    constructor(readonly ogshError: Errors, readonly info?: string | Error) {
        super(`${info}`);
    }
}

export function getErrorHttpStatus(error: Errors): number {
    return httpErrors.get(error) || HTTPStatus.SERVER_ERROR;
}

interface ErrorResponseBody {
    error: Errors;
    info?: string;
}
export function formatErrorResponseBody(error: Error | OGSHError): ErrorResponseBody {
    return {
        error: error instanceof OGSHError ? (error as OGSHError).ogshError : "general/unspecified",
        info: error.message // TODO only return this in a dev environment
    }
}