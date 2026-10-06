import type { Client } from "discord.js";

import type { Logger } from "../services/Logger.js";
import type { TimerRegistry } from "../services/TimerRegistry.js";
import type { Registry } from "./Registry.js";

export type ShutdownReason =
    | "signal"
    | "api"
    | "error"
    | "dev-restart"
    | "manual";

export interface ShutdownOptions {
    readonly logger: Logger;
    readonly registry: Registry;
    readonly timers: TimerRegistry;
    readonly client: Client | null;
    readonly onFinish?: (reason: ShutdownReason) => void | Promise<void>;
    readonly exit?: (code: number) => void;
    readonly signals?: readonly NodeJS.Signals[];
}

const DEFAULT_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

/**
 * Temiz kapanma.
 *
 * Sirasi: (1) kapatma durumu, (2) modullerin `onDispose` kayitlari,
 * (3) framework'un ekledigi event dinleyicileri, (4) zamanlayicilar,
 * (5) Discord baglantisi, (6) cikis.
 *
 * Cift cagriya karsi korumali; `dissora dev` yeniden baslatmalarinda
 * güvenle kullanilabilir.
 */
export class Shutdown {
    private readonly logger: Logger;

    private readonly registry: Registry;

    private readonly timers: TimerRegistry;

    private readonly client: Client | null;

    private readonly onFinish:
        | ((reason: ShutdownReason) => void | Promise<void>)
        | undefined;

    private readonly exit: (code: number) => void;

    private readonly signals: readonly NodeJS.Signals[];

    private running = false;

    private registered = false;

    private guarded = false;

    private onUnhandledRejection: ((reason: unknown) => void) | undefined;

    private onUncaughtException: ((error: Error) => void) | undefined;

    /**
     * Devam eden kapanis. Ikinci bir `run()` cagrisi bunu bekler, hemen
     * donmez: `dev` yeniden baslatmasi eski botun `destroy()`'i bitmeden
     * yeni botu acmaz.
     */
    private inFlight: Promise<void> | undefined;

    private readonly bound: () => void;

    constructor(options: ShutdownOptions) {
        this.logger = options.logger;
        this.registry = options.registry;
        this.timers = options.timers;
        this.client = options.client;
        this.onFinish = options.onFinish;
        this.exit = options.exit ?? (code => process.exit(code));
        this.signals = options.signals ?? DEFAULT_SIGNALS;
        this.bound = () => {
            void this.run("signal", 0);
        };
    }

    get isRunning(): boolean {
        return this.running;
    }

    /** Sinyal ve process hata dinleyicilerini ekler. */
    register(): void {
        if (this.registered) {
            return;
        }

        this.registered = true;

        for (const signal of this.signals) {
            process.on(signal, this.bound);
        }
    }

    unregister(): void {
        if (!this.registered) {
            return;
        }

        this.registered = false;

        for (const signal of this.signals) {
            process.off(signal, this.bound);
        }
    }

    /** `guard()` ile eklenen hata dinleyicilerini de kaldirir. */
    unguard(): void {
        if (!this.guarded) {
            return;
        }

        this.guarded = false;

        if (this.onUnhandledRejection) {
            process.off("unhandledRejection", this.onUnhandledRejection);
            this.onUnhandledRejection = undefined;
        }

        if (this.onUncaughtException) {
            process.off("uncaughtException", this.onUncaughtException);
            this.onUncaughtException = undefined;
        }
    }

    /**
     * Yakalanmamis hatalari logla ve kapat.
     *
     * Dinleyiciler isimsiz eklenir; `unregister()` onlari da kaldirir.
     * Aksi halde `dissora dev` her yeniden baslatmada surece yeni bir
     * dinleyici ekler ve eski botlardan gelen hatalar birden fazla kez
     * loglanir. `MaxListenersExceededWarning` de boylece onlenir.
     */
    guard(): void {
        if (this.guarded) {
            return;
        }

        this.guarded = true;

        this.onUnhandledRejection = reason => {
            this.logger.error(
                "yakalanmamis promise hatasi",
                reason instanceof Error
                    ? (reason.stack ?? reason.message)
                    : reason
            );
            void this.run("error", 1);
        };

        this.onUncaughtException = error => {
            this.logger.error(
                "yakalanmamis istisna",
                error.stack ?? error.message
            );
            void this.run("error", 1);
        };

        process.on("unhandledRejection", this.onUnhandledRejection);
        process.on("uncaughtException", this.onUncaughtException);
    }

    /**
     * Kapanis dizisini calistirir.
     *
     * `exitProcess` yalnizca sinyal / yakalanmamis hata yollarinda `true`
     * olur; programatik `stop()` cagrilarinda `false` verilir, boylece
     * `dissora dev` yeniden baslatabilir ve CLI cikis kodunu kendisi belirler.
     */
    async run(
        reason: ShutdownReason,
        code = 0,
        exitProcess = true
    ): Promise<void> {
        if (this.inFlight) {
            // Kapanis zaten basladi: yeni is yalnizca mevcut isin
            // bitmesini bekler, ikinci bir temizlik turu calismaz.
            return this.inFlight;
        }

        this.running = true;

        const task = this.execute(reason, code, exitProcess);

        this.inFlight = task;

        try {
            await task;
        } finally {
            this.inFlight = undefined;
            this.running = false;
        }
    }

    private async execute(
        reason: ShutdownReason,
        code: number,
        exitProcess: boolean
    ): Promise<void> {
        this.unregister();
        this.unguard();

        this.logger.info(`kapatiliyor (${reason})`);

        const disposers = await this.registry.runDisposers();

        if (disposers.ran > 0) {
            this.logger.debug(`${disposers.ran} temizlik kaydi calistirildi`);
        }

        if (disposers.failed > 0) {
            this.logger.warn(
                `${disposers.failed} temizlik kaydi basarisiz oldu`
            );
        }

        const detached = this.registry.detachBindings();

        if (detached > 0) {
            this.logger.debug(`${detached} event dinleyicisi kaldirildi`);
        }

        // Zamanlayici sayaci `TimerRegistry.clearAll()` icinde zaten loglanir.
        this.timers.clearAll();

        if (this.client) {
            try {
                await this.client.destroy();
            } catch (error) {
                this.logger.warn(
                    "baglanti kapatilamadi",
                    error instanceof Error ? error.message : error
                );
            }
        }

        await this.onFinish?.(reason);

        if (exitProcess) {
            this.exit(code);
        }
    }
}
