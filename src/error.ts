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

    | "app/not-found"
    | "app/variant-not-found"
    | "app/version-not-found"
    | "app/startup-files-not-found"
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