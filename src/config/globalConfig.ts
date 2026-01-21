import { constants } from "../constants";
import { getGlobalConfigBranch } from "../env";
import { Config } from "./config";

interface Global {
    segment: {
        memory_mb: number;
        storage_gb: number;
        price: {
            [currency: string]: number;
        }
    },
    regions: {
        [twoDigitIsoCode: string]: {
            name: string;
            region: string;
            price_multiplier: number;
        }
    }
}

class GlobalConfig extends Config<Global> {
    constructor() {
        super(
            "Global",
            constants.config.github_user_content_url,
            "configs",
            getGlobalConfigBranch(),
            "global.json"
        );
    }
}

const globalConfig = new GlobalConfig();

export async function getGlobalConfig(): Promise<Global> {
    return globalConfig.getConfig();
}