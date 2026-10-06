import type {
    Client,
    ClientEvents,
    RESTPostAPIApplicationCommandsJSONBody
} from "discord.js";

import type { AlwaysModule, CommandModule, EventModule } from "./context.js";

/**
 * Tip denetimi icin kimlik fonksiyonlari.
 *
 * Calisma zamaninda yalnizca dogrulama yapar, nesneyi oldugu gibi dondurur.
 * Boylece modul dosyalari `dissora` paketine bagimli olmadan calisabilir.
 */

export function defineCommand<const T extends CommandModule>(command: T): T {
    if (command === null || typeof command !== "object") {
        throw new TypeError("defineCommand: obje gerekli");
    }

    if (typeof command.execute !== "function") {
        throw new TypeError("defineCommand: execute fonksiyonu gerekli");
    }

    return command;
}

export interface EventDefinition<K extends keyof ClientEvents & string> {
    readonly event: K;
    readonly execute: (...args: ClientEvents[K]) => unknown;
    readonly once?: boolean;
}

/**
 * Iki kullanim bicimi desteklenir:
 *
 * ```ts
 * defineEvent("ready", (client) => { ... });
 * defineEvent({ event: "ready", execute: (client) => { ... }, once: true });
 * ```
 */
export function defineEvent<K extends keyof ClientEvents & string>(
    event: K,
    execute: (...args: ClientEvents[K]) => unknown,
    options?: { readonly once?: boolean }
): EventModule;
export function defineEvent<K extends keyof ClientEvents & string>(
    definition: EventDefinition<K>
): EventModule;
export function defineEvent<K extends keyof ClientEvents & string>(
    first: K | EventDefinition<K>,
    execute?: (...args: ClientEvents[K]) => unknown,
    options?: { readonly once?: boolean }
): EventModule {
    const definition: EventDefinition<K> =
        typeof first === "string"
            ? {
                  event: first,
                  execute: execute as EventDefinition<K>["execute"],
                  ...options
              }
            : first;

    if (
        typeof definition?.event !== "string" ||
        definition.event.length === 0
    ) {
        throw new TypeError("defineEvent: event adi gerekli");
    }

    if (typeof definition.execute !== "function") {
        throw new TypeError("defineEvent: execute fonksiyonu gerekli");
    }

    return {
        event: definition.event,
        ...(definition.once === undefined ? {} : { once: definition.once }),
        execute: definition.execute as (...args: never[]) => unknown
    };
}

export interface AlwaysDefinition {
    /**
     * Periyot (ms). `moduleconfig.json` yazmazsa **zorunlu**.
     *
     * Dosya degeri config'in uzerine yazar; boylece bir gorevi baska
     * bir modulle paylasirken periyodu kodla degistirmek yeterlidir.
     */
    readonly interval?: number;
    readonly runOnStart?: boolean;
    /**
     * Gunluk etiketi. Yalnizca `TimerRegistry` anahtari olarak kullanilir;
     * kaldirilmasi modulun loglarini degistirmez.
     */
    readonly name?: string;
    readonly execute: AlwaysModule["execute"];
}

/**
 * `defineAlways(execute, { interval })` veya
 * `defineAlways({ interval, execute })` kabul eder.
 *
 * `interval` verilmezse `moduleconfig.json` degeri kullanilir.
 */
export function defineAlways(
    execute: AlwaysModule["execute"],
    options?: {
        readonly interval?: number;
        readonly runOnStart?: boolean;
        readonly name?: string;
    }
): AlwaysModule;
export function defineAlways(definition: AlwaysDefinition): AlwaysModule;
export function defineAlways(
    first: AlwaysModule["execute"] | AlwaysDefinition,
    options?: {
        readonly interval?: number;
        readonly runOnStart?: boolean;
        readonly name?: string;
    }
): AlwaysModule {
    const definition: AlwaysDefinition =
        typeof first === "function" ? { ...options, execute: first } : first;

    if (typeof definition?.execute !== "function") {
        throw new TypeError("defineAlways: execute fonksiyonu gerekli");
    }

    // Periyot yalnizca dosyada **ve** config'de yoksa hatadir.
    if (definition.interval !== undefined) {
        if (!Number.isFinite(definition.interval) || definition.interval <= 0) {
            throw new TypeError("defineAlways: interval gerekli");
        }
    }

    return {
        // `undefined` degerler config'in kullanmasina birakilir.
        ...(definition.interval === undefined
            ? {}
            : { interval: definition.interval }),
        ...(definition.runOnStart === undefined
            ? {}
            : { runOnStart: definition.runOnStart }),
        ...(definition.name === undefined ? {} : { name: definition.name }),
        execute: definition.execute
    };
}
export type CommandPayload = RESTPostAPIApplicationCommandsJSONBody;

export type { Client, ClientEvents };
