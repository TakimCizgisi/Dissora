const { DissoraBot } = require("dissora");

/**
 * Botu baslatir. Tum is mantigi `Modules/` altinda yaşar; bu dosya
 * yalnizca giris noktasidir.
 */
async function main() {
    const bot = new DissoraBot(process.cwd());

    await bot.start();
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
