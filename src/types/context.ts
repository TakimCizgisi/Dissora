import type {
    ChatInputCommandInteraction,
    Client,
    RESTPostAPIApplicationCommandsJSONBody,
    SlashCommandBuilder
} from "discord.js";

import type { BotConfig } from "../config/bot-config.js";
import type { ModuleConfig } from "../config/module-config.js";
import type { ResolvedConfig } from "../config/resolve.js";
import type { DissoraBot } from "../core/Bot.js";
import type { DissoraClient } from "../core/DissoraClient.js";
import type { ModuleRuntime } from "../core/ModuleRuntime.js";
import type { Registry } from "../core/Registry.js";
import type { Logger } from "../services/Logger.js";
import type { ProjectPaths } from "../services/Paths.js";
import type { TimerRegistry } from "../services/TimerRegistry.js";

/** Duz JSON komut tanimi. */
export interface CommandDataJson {
    name: string;
    description?: string;
    options?: unknown[];
    [key: string]: unknown;
}

/**
 * Discord'a gonderilecek normalize edilmis komut govdesi.
 *
 * `name` ve `description` her zaman mevcuttur; bu yuzden moduller
 * `RegisteredCommand.data.description` okurken tip denetimine takilmaz.
 */
export type ChatInputCommandBody = RESTPostAPIApplicationCommandsJSONBody & {
    readonly name: string;
    readonly description: string;
};

/** Slash komutu tanimi: builder, duz JSON veya `toJSON()` ureten nesne. */
export type CommandData =
    | SlashCommandBuilder
    | CommandDataJson
    | { toJSON(): unknown };

export type CommandExecutor = (
    context: CommandContext
) => unknown | Promise<unknown>;

export interface CommandModule {
    /** Dosya adindan turetilir; verilirse `data.name` ile ayni olmali. */
    readonly name?: string;
    readonly description?: string;
    readonly data?: CommandData;
    readonly execute: CommandExecutor;
}

export interface CommandContext {
    readonly interaction: ChatInputCommandInteraction;
    readonly client: Client;
    readonly module: string;
    /** Komutun ait oldugu modul config'i. Programatik kayitlarda bot config'i gelir. */
    readonly config: ModuleConfig | BotConfig;
    readonly env: NodeJS.ProcessEnv;
    readonly log: Logger;
    readonly dissora: DissoraClient;
}

export interface EventModule {
    readonly event: string;
    readonly once?: boolean;
    readonly execute: (...args: never[]) => unknown;
}

export interface AlwaysModule {
    /** Dosyada tanimliysa `moduleconfig.json` degerini ezer. */
    readonly interval?: number;
    readonly runOnStart?: boolean;
    readonly name?: string;
    readonly execute: (context: ModuleContext) => unknown;
}

export type Disposer = () => unknown | Promise<unknown>;

export interface ModuleContext {
    readonly client: Client;
    readonly bot: DissoraBot;
    readonly module: string;
    readonly folder: string;
    readonly config: ModuleConfig;
    readonly env: NodeJS.ProcessEnv;
    readonly log: Logger;
    readonly dissora: DissoraClient;
    readonly paths: ProjectPaths;
    readonly timers: TimerRegistry;
    readonly registry: Registry;
    readonly resolved: ResolvedConfig;
    /** Programatik komut kaydi (dosya yerine). */
    registerCommand(command: CommandModule): void;
    /** Programatik event kaydi. */
    registerEvent(event: EventModule): void;
    /** Kapanista calisacak temizlik fonksiyonu. */
    onDispose(disposer: Disposer): void;
}

export interface ModuleExports {
    init?: (context: ModuleContext) => unknown;
    start?: (context: ModuleContext) => unknown;
}

export type ModuleState = "loaded" | "disabled" | "skipped" | "failed";

export type { ModuleConfig, ModuleRuntime, ResolvedConfig };
