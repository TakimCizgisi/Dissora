/**
 * Dissora - public API.
 *
 * Bot tarafi:
 * ```ts
 * import { DissoraBot } from "dissora";
 *
 * const bot = new DissoraBot(process.cwd());
 * await bot.start();
 * ```
 *
 * Modul tarafi:
 * ```ts
 * import type { ModuleContext } from "dissora";
 * import { defineCommand } from "dissora";
 * ```
 */

import type { Client } from "discord.js";

import "./types/index.js";

export type {
    BotActivityConfig,
    BotCommandsConfig,
    BotConfig,
    BotLoggingConfig,
    BotStatus,
    CommandScope
} from "./config/bot-config.js";
export {
    DEFAULT_BOT_CONFIG,
    parseBotConfig
} from "./config/bot-config.js";
export type { ConfigIssue } from "./config/errors.js";
export { ConfigError } from "./config/errors.js";
export type { ModuleConfig } from "./config/module-config.js";
export {
    isSafeName,
    parseModuleConfig,
    SAFE_NAME_PATTERN
} from "./config/module-config.js";
export type {
    ConfigLayer,
    ConfigSnapshot,
    ResolvedConfig
} from "./config/resolve.js";
export { ConfigService } from "./config/resolve.js";
export type { BotOptions, BotState } from "./core/Bot.js";
export { DissoraBot } from "./core/Bot.js";
export type {
    SyncOptions,
    SyncReport,
    SyncScope
} from "./core/CommandSync.js";
export { syncCommands } from "./core/CommandSync.js";
export type {
    DependencyPlan,
    ModuleCandidate,
    ModulePlanEntry
} from "./core/DependencyResolver.js";
export { resolveModulePlan } from "./core/DependencyResolver.js";
export type {
    DissoraClient,
    ModuleDirectory
} from "./core/DissoraClient.js";
export { createDissoraClient } from "./core/DissoraClient.js";
export { ModuleHost } from "./core/ModuleHost.js";
export type { ModuleRuntime, ModuleState } from "./core/ModuleRuntime.js";
export { createModuleRuntime } from "./core/ModuleRuntime.js";
export type {
    BindingEmitter,
    RegisteredCommand,
    RegisteredEvent,
    TrackedHandler
} from "./core/Registry.js";
export { Registry } from "./core/Registry.js";
export type { ShutdownReason } from "./core/Shutdown.js";
export { Shutdown } from "./core/Shutdown.js";
export {
    AlwaysLoader,
    CommandLoader,
    EventLoader,
    isValidCommandName,
    LOADERS,
    loaderNames
} from "./loaders/index.js";
export type { Loader, LoaderContext } from "./loaders/types.js";
export { LoaderError } from "./loaders/types.js";
export type { LoggerOptions, LogLevel } from "./services/Logger.js";
export { createLogger, isLogLevel, Logger } from "./services/Logger.js";
export { ProjectPaths } from "./services/Paths.js";
export type { ActiveTimer, TimerHandle } from "./services/TimerRegistry.js";
export { TimerRegistry } from "./services/TimerRegistry.js";
export type { WatchHandle, WatchOptions } from "./services/Watcher.js";
export { watchTree } from "./services/Watcher.js";
export {
    defineAlways,
    defineCommand,
    defineEvent
} from "./types/define.js";
export type {
    AlwaysModule,
    ClientEvents,
    CommandContext,
    CommandData,
    CommandExecutor,
    CommandModule,
    CommandPayload,
    Disposer,
    EventModule,
    ModuleContext,
    ModuleExports
} from "./types/index.js";
export {
    BRAND_GRADIENT,
    DISSORA_LOGO,
    LSH_COLOR,
    LSH_LOGO,
    MODULE_TAG_COLORS,
    PALETTE,
    renderBanner,
    renderDissoraLogo,
    renderLshLogo,
    tagColorFor
} from "./utils/branding.js";
export type { ColorDepth, ColorSupport, Rgb } from "./utils/colors.js";
export {
    createStyler,
    detectColorSupport,
    getStyler,
    hexToRgb,
    mixColor,
    rgbToHex,
    setColorSupport,
    stripAnsi
} from "./utils/colors.js";
export { VERSION } from "./version.js";

export type { Client };
