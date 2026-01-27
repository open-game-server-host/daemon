import { HTTPStatus } from "./http/httpStatus";

export type Errors =
    | "general/unspecified"

    | "container/not-found"
    | "container/image-pull-failed"
    | "container/create-failed"
    | "container/terminated"
    | "container/invalid"
    | "container/offline"
    | "container/command-failed"

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

    getHttpStatus(): number {
        return httpErrors.get(this.ogshError) || HTTPStatus.SERVER_ERROR;
    }
}