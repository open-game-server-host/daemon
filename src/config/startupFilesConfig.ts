import { getAppsBranch, getGithubRawFileUrl, Logger, OGSHError } from "@open-game-server-host/backend-lib";
import childProcess from "child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { STARTUP_FILES_PATH } from "../constants";
import { getDaemonConfig } from "./daemonConfig";

const logger = new Logger("CONFIG: startup files");

let callbacks: (() => void)[] = [];
let filesDownloaded = false;

export async function updateStartupFiles() {
    const url = getGithubRawFileUrl("apps", getAppsBranch(), "output/startup_files.tar");
    const response = await fetch(url);
    if (!response.body) {
        throw new OGSHError("config/download-failed", "startup files response.body was empty");
    }
    const daemonConfig = await getDaemonConfig();
    rmSync(STARTUP_FILES_PATH, { recursive: true, force: true });
    mkdirSync(STARTUP_FILES_PATH, { recursive: true });
    const fileStream = createWriteStream(path.resolve(`${STARTUP_FILES_PATH}/startup_files.tar`), { flags: 'wx' });
    const writeStream = Readable.fromWeb(response.body as any).pipe(fileStream);
    await new Promise<void>((res, rej) => {
        writeStream.on("error", rej);
        writeStream.on("close", () => {
            res();
        });
    });

    const child = childProcess.exec("tar xf startup_files/startup_files.tar -C startup_files");
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    await new Promise<void>(res => {
        child.on("exit", res);
    });
    rmSync("startup_files/startup_files.tar");

    logger.info("Updated");

    filesDownloaded = true;
    callbacks.forEach(cb => cb());
    callbacks = [];
}
updateStartupFiles();

export async function getStartupFilesPath(appId: string, variantId: string): Promise<string> {
    if (!filesDownloaded) {
        await new Promise<void>(res => callbacks.push(res));
    }
    const daemonConfig = await getDaemonConfig();

    if (!existsSync(STARTUP_FILES_PATH)) {
        throw new OGSHError("app/startup-files-not-found", `path: '${STARTUP_FILES_PATH}'`);
    }

    let startupFilesPath = `${STARTUP_FILES_PATH}/${appId}/${variantId}`;
    if (existsSync(startupFilesPath)) {
        return path.resolve(startupFilesPath);
    }

    startupFilesPath = `${STARTUP_FILES_PATH}/${appId}`;
    if (existsSync(startupFilesPath)) {
        return path.resolve(startupFilesPath);
    }

    throw new OGSHError("app/startup-files-not-found", `appId '${appId}' variantId '${variantId}'`);
}