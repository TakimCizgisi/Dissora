import { DissoraBot } from "dissora";

/**
 * Botu baslatir. Tum is mantigi `Modules/` altinda yasar; bu dosya
 * yalnizca giris noktasidir.
 */
async function main(): Promise<void> {
    const bot = new DissoraBot(process.cwd());

    await bot.start();
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
