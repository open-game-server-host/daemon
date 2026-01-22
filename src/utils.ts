export async function sleep(ms: number) {
    if (!Number.isInteger(ms)) {
        // TODO throw error
    }
    if (ms <= 0) {
        // TODO throw error
    }
    await new Promise<void>(res => setTimeout(res, ms));
}

export function getKb(amount: number): number {
    return amount * 1_000;
}

export function getMb(amount: number): number {
    return amount * 1_000_000;
}