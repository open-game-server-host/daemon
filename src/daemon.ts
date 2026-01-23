import { getApps } from "./config/appsConfig";
import { Container, registerContainer } from "./container/container";
import { initHttpServer } from "./http/httpServer";

async function init() {
    // TODO temporary for testing a container
    const apps = await getApps();

    const app = apps["minecraft_java_edition"];
    const variant = app.variants["release"];
    const version = variant.versions[""];

    registerContainer(new Container("aContainerId", {
        app,
        variant,
        version,
        name: "Test",
        runtimeImage: "java25",
        segments: 1
    }));
    await initHttpServer();
}

init();