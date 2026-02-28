import { realpathSync } from "fs";

export const CONTAINER_WORK_DIR = realpathSync(".");
export const APP_ARCHIVES_PATH = `${CONTAINER_WORK_DIR}/app_archives`;
export const CONTAINER_FILES_PATH = `${CONTAINER_WORK_DIR}/container_files`;
export const STARTUP_FILES_PATH = `${CONTAINER_WORK_DIR}/startup_files`;