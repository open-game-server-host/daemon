import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getAppsBranch } from "../env";
import { Logger } from "../logger";
import { getDaemonConfig } from "./daemonConfig";
import childProcess from "child_process";

const logger = new Logger("Startup Files");

let callbacks: (() => void)[] = [];
let filesDownloaded = false;

export async function updateStartupFiles() {
    logger.info("Updating");
    // TODO downloading raw blobs from github has a different url to text files so we can't use github_user_content_url defined in constants; for now this is hard coded
    const url = `https://github.com/open-game-server-host/apps/raw/refs/heads/${getAppsBranch()}/output/startup_files.tar`;
    const response = await fetch(url);
    if (!response.body) {
        throw new Error("Failed");
    }
    const daemonConfig = await getDaemonConfig();
    rmSync(daemonConfig.startup_files_path, { recursive: true, force: true });
    mkdirSync(daemonConfig.startup_files_path, { recursive: true });
    const fileStream = createWriteStream(path.resolve(`${daemonConfig.startup_files_path}/startup_files.tar`), { flags: 'wx' });
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
        console.log
        await new Promise<void>(res => callbacks.push(res));
    }
    const daemonConfig = await getDaemonConfig();

    if (!existsSync(daemonConfig.startup_files_path)) {
        throw new Error(`startup files path not found! (${daemonConfig.startup_files_path})`);
    }

    let startupFilesPath = `${daemonConfig.startup_files_path}/${appId}/${variantId}`;
    if (existsSync(startupFilesPath)) {
        return path.resolve(startupFilesPath);
    }

    startupFilesPath = `${daemonConfig.startup_files_path}/${appId}`;
    if (existsSync(startupFilesPath)) {
        return path.resolve(startupFilesPath);
    }

    throw new Error(`no startup files found for appId '${appId}' variantId '${variantId}'`);
}