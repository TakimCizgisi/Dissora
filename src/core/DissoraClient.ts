import type { Client } from "discord.js";

import type { ResolvedConfig } from "../config/resolve.js";
import type { Disposer } from "../types/context.js";
import type { DissoraBot } from "./Bot.js";
import type { ModuleRuntime } from "./ModuleRuntime.js";
import type { DissoraServices } from "./services.js";

export type { DissoraServices };

/** `client.dissora` uzerinden modul erisimi. */
export interface DissoraClient {
    readonly version: string;
    readonly bot: DissoraBot;
    /** Hazir degilse hata firlatir (`start()` cagrilmadan once kullanma). */
    readonly client: Client;
    readonly config: ResolvedConfig;
    readonly log: LoggerLike;
    readonly modules: ModuleDirectory;
    readonly services: DissoraServices;
    /** Modulun `index` export'unu dondurur (yoksa undefined). */
    module<T = unknown>(name: string): T | undefined;
    /** Bot kapanirken calisacak temizlik kaydi. */
    onDispose(disposer: Disposer): void;
}

export interface LoggerLike {
    trace(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    success(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    print(message: string): void;
}

export interface ModuleDirectory {
    get(name: string): ModuleRuntime | undefined;
    has(name: string): boolean;
    list(): ModuleRuntime[];
    /** Basariyla yuklenmis modul mu? */
    isLoaded(name: string): boolean;
    loaded(): ModuleRuntime[];
    failed(): ModuleRuntime[];
}

export interface DissoraClientInit {
    readonly bot: DissoraBot;
    readonly log: LoggerLike;
    readonly services: DissoraServices;
    readonly version: string;
    readonly exports: Map<string, unknown>;
}

export function createDissoraClient(init: DissoraClientInit): DissoraClient {
    const modules: ModuleDirectory = {
        get: name => init.bot.modules.get(name),
        has: name => init.bot.modules.has(name),
        list: () => [...init.bot.modules.values()],
        isLoaded: name => init.bot.modules.get(name)?.state === "loaded",
        loaded: () =>
            [...init.bot.modules.values()].filter(
                entry => entry.state === "loaded"
            ),
        failed: () =>
            [...init.bot.modules.values()].filter(
                entry => entry.state === "failed"
            )
    };

    const dissora: DissoraClient = {
        version: init.version,
        bot: init.bot,
        get client(): Client {
            const client = init.bot.client;

            if (client === null) {
                throw new Error(
                    "Client henuz olusmadi. once await bot.start() cagrin."
                );
            }

            return client;
        },
        get config() {
            return init.bot.config;
        },
        log: init.log,
        modules,
        services: init.services,
        module<T = unknown>(name: string): T | undefined {
            return init.exports.get(name) as T | undefined;
        },
        onDispose(disposer: Disposer): void {
            init.services.registry.addDisposer(disposer);
        }
    };

    return dissora;
}
