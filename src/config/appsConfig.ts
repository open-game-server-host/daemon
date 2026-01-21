import { constants } from "../constants";
import { getAppsBranch } from "../env";
import { Config } from "./config";

export interface App {
    name: string;
    description: string;
    coming_soon: boolean;
    default_variant: string;
    variants: {
        [variantId: string]: Variant;
    }
}

export interface Variant {
    name: string;
    stop_command?: string;
    ports: {
        [portNumber: string]: string; // port number : port name
    },
    runtime: string;
    default_runtime_image: string;
    minimum_segments: number;
    recommended_segments: number;
    anchor_versions: {
        [name: string]: {
            name: string;
            default_runtime_image: string;
            minimum_segments: number;
            recommended_segments: number;
            supported_runtime_images: string[];
        }[];
    }
    versions: {
        [versionId: string]: Version;
    }
}

export interface Version {
    name: string;
    current_build: number;
    current_build_file_hashes: {
        [localFilePath: string]: string;
    },
    current_build_info: string;
    default_runtime_image?: string;
    supported_runtime_images: string[];
    minimum_segments?: number;
    recommended_segments?: number;
}

class AppsConfig extends Config<App[]> {
    constructor() {
        super(
            "Apps",
            constants.config.github_user_content_url,
            "apps",
            getAppsBranch(),
            "output/apps.json"
        );
    }
}

const appsConfig = new AppsConfig();

export async function getApps(): Promise<App[]> {
    return appsConfig.getConfig();
}