export async function sleep(ms: number) {
    if (!Number.isInteger(ms)) {
        ms = Math.floor(ms);
    }
    if (ms <= 0) {
        ms = 0;
    }
    await new Promise<void>(res => setTimeout(res, ms));
}

export function getKb(amount: number): number {
    return amount * 1_000;
}

export function getMb(amount: number): number {
    return amount * 1_000_000;
}