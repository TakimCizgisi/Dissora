/**
 * `dissora dev` - gelistirme modu.
 *
 * `Modules/` agacini izler, degisiklik oldugunda botu temiz sekilde
 * durdurup yeniden baslatir. Global komut kaydi varsayilan olarak atlanir
 * (yerel gelistirmede saatlerce beklemek olmamali); `--sync` ile
 * zorlanabilir.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { DissoraBot } from "../core/Bot.js";
import { isLogLevel, Logger } from "../services/Logger.js";
import { type WatchHandle, watchTree } from "../services/Watcher.js";
import { flagBool, flagString, type ParsedArgs, printBanner } from "./utils.js";

const RESTART_DEBOUNCE_MS = 300;

export interface DevOptions {
    readonly projectPath: string;
    readonly logLevel: string | null;
    readonly sync: boolean;
    readonly showBanner: boolean;
}

export function resolveDevOptions(
    projectPath: string,
    args: ParsedArgs
): DevOptions {
    return {
        projectPath,
        logLevel: flagString(args, "log-level"),
        sync: flagBool(args, "sync"),
        showBanner: !flagBool(args, "no-banner")
    };
}

/**
 * Botu baslatir ve degisiklikleri izlemeye devam eder.
 * Cozulenmezse (SIGINT) temiz kapanis yapilir.
 */
export async function devCommand(options: DevOptions): Promise<void> {
    if (options.showBanner) {
        printBanner();
    }

    const level =
        options.logLevel !== null && isLogLevel(options.logLevel)
            ? options.logLevel
            : "debug";

    const logger = new Logger({ level });
    let bot: DissoraBot | null = null;
    let watcher: WatchHandle | null = null;
    let stopped = false;

    /**
     * Yeniden baslatma zinciri.
     *
     * Degisiklikler tek bir siraya baglanir: iki olay arka arkaya gelirse
     * ikinci `onChange` mevcut restart'i bekler, yarim kalan bot
     * durumu birakmaz. Onceki kod `void (async () => ...)()` kullanirdi;
     * reddedilen promise `unhandledRejection`'a dusup sureci kirletirdi.
     */
    let chain: Promise<void> = Promise.resolve();

    const enqueue = (task: () => Promise<void>): void => {
        chain = chain.then(task).catch((error: unknown) => {
            logger.error(
                "yeniden baslatma hatasi",
                error instanceof Error ? (error.stack ?? error.message) : error
            );
        });
    };

    const launch = async (): Promise<void> => {
        if (stopped) {
            return;
        }

        const current = new DissoraBot(options.projectPath, {
            logLevel: level,
            registerCommands: options.sync ? undefined : false,
            exitOnShutdown: false
        });

        // Referans once guncellenmeli: `stop()` cagrisi yeni botu durdurmasin.
        bot = current;

        try {
            await current.start();
        } catch (error) {
            logger.error(
                "bot baslatilamadi",
                error instanceof Error ? (error.stack ?? error.message) : error
            );
        }

        if (stopped) {
            return;
        }

        // Modul dizini config'ten gelir (DISSORA_MODULES_DIR / BotConfig.json).
        const modulesDir = resolve(
            options.projectPath,
            current.config.modulesDir || "Modules"
        );

        if (watcher === null && existsSync(modulesDir)) {
            watcher = watchTree({
                dir: modulesDir,
                debounceMs: RESTART_DEBOUNCE_MS,
                logger,
                onChange: reason => {
                    if (stopped) {
                        return;
                    }

                    logger.info(
                        `degisiklik (${reason}) - yeniden baslatiliyor`
                    );

                    enqueue(async () => {
                        if (stopped) {
                            return;
                        }

                        // Yeni bot, eski bot kapanmadan **once** referans
                        // alinmaz; boylece `dev` sirasinda yanlis nesne
                        // durdurulmaz.
                        const previous = bot;

                        bot = null;

                        await previous?.stop("dev-restart");
                        await launch();
                    });
                }
            });

            logger.debug(`izleme modu: ${watcher.mode}`);
        }
    };

    let finished: () => void = () => undefined;

    const done = new Promise<void>(resolvePromise => {
        finished = resolvePromise;
    });

    const shutdown = async (): Promise<void> => {
        if (stopped) {
            return;
        }

        stopped = true;

        // Once izlemeyi durdur: kapanis sirasinda gelen degisiklik yeni bir
        // restart zinciri baslatmamali.
        watcher?.close();
        watcher = null;

        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);

        const current = bot;

        bot = null;

        await current?.stop("signal");

        // Bekleyen restart varsa bitsin, sonra CLI cikis kodunu belirle.
        await chain;

        finished();
    };

    function onSignal(): void {
        void shutdown();
    }

    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    await launch();

    // Izleme dongusu process'i ayakta tutsun. Interval referansli birakiliyor:
    // bot baglanamasa bile izleme modu calisir, SIGINT gelince dongu biter.
    await done;
}
