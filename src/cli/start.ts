/**
 * `dissora start` - botu baslatir.
 */

import { DissoraBot } from "../core/Bot.js";
import type { LogLevel } from "../services/Logger.js";
import { isLogLevel } from "../services/Logger.js";
import { flagBool, flagString, type ParsedArgs, printBanner } from "./utils.js";

export interface StartOptions {
    readonly projectPath: string;
    readonly logLevel: LogLevel | null;
    readonly showBanner: boolean;
    /** Global komut kaydi atlanir (dev modunda yararli). */
    readonly noSync: boolean;
}

export function resolveStartOptions(
    projectPath: string,
    args: ParsedArgs
): StartOptions {
    const level = flagString(args, "log-level");

    return {
        projectPath,
        logLevel: level !== null && isLogLevel(level) ? level : null,
        showBanner: !flagBool(args, "no-banner"),
        noSync: flagBool(args, "no-sync")
    };
}

export async function startCommand(options: StartOptions): Promise<DissoraBot> {
    if (options.showBanner) {
        printBanner();
    }

    const bot = new DissoraBot(options.projectPath, {
        ...(options.logLevel === null ? {} : { logLevel: options.logLevel }),
        registerCommands: options.noSync ? false : undefined
    });

    await bot.start();

    return bot;
}
