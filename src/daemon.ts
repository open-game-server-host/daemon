import { initHttpServer } from "./http/httpServer";

async function init() {
    await initHttpServer();
}

init();