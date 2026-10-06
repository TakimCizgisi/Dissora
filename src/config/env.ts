/**
 * .env / ortam degiskeni semasi.
 *
 * Ortam degiskenleri en ust katmandir: her sey degeri .env uzerinden
 * gecersiz kılabilir. Tanımlar `ENV_FIELDS` icinde hem maskeleme
 * (`dissora config show`) hem de dokumantasyon icin kullanilir.
 */

import { ACTIVITY_TYPES, BOT_STATUSES, COMMAND_SCOPES } from "./bot-config.js";
import {
    asBoolean,
    asOneOf,
    type ConfigIssue,
    throwIfInvalid
} from "./errors.js";

export const LOG_LEVELS = [
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "silent"
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface EnvConfig {
    readonly token: string | null;
    readonly guildId: string | null;
    readonly modulesDir: string;
    /** null => .env'de tanimsiz; dosya degeri korunur. */
    readonly logLevel: LogLevel | null;
    /** null => .env'de tanimsiz; dosya degeri korunur. */
    readonly logTimestamps: boolean | null;
    readonly botName: string | null;
    readonly status: (typeof BOT_STATUSES)[number] | null;
    readonly activityType: (typeof ACTIVITY_TYPES)[number] | null;
    readonly activityName: string | null;
    readonly intents: readonly string[] | null;
    readonly commandScope: (typeof COMMAND_SCOPES)[number] | null;
    readonly pruneStale: boolean | null;
    readonly owners: readonly string[] | null;
    readonly locale: string | null;
    readonly noColor: boolean;
}

export interface EnvFieldInfo {
    readonly key: string;
    readonly description: string;
    readonly secret: boolean;
}

export const ENV_FIELDS: readonly EnvFieldInfo[] = [
    {
        key: "DISSORA_TOKEN",
        description: "Bot tokeni. Zorunlu. (eski ad: DISCORD_TOKEN)",
        secret: true
    },
    {
        key: "DISSORA_GUILD_ID",
        description:
            'Komut kaydi guild icin mi global mi: sunucu id veya "all". ' +
            "(eski ad: DISCORD_GUILD_ID)",
        secret: false
    },
    {
        key: "DISSORA_MODULES_DIR",
        description: 'Modul klasoru (varsayilan "Modules").',
        secret: false
    },
    {
        key: "DISSORA_LOG_LEVEL",
        description: `trace | debug | info | warn | error | silent (varsayilan "info").`,
        secret: false
    },
    {
        key: "DISSORA_LOG_TIMESTAMPS",
        description: "Log satirina zaman damgasi ekler.",
        secret: false
    },
    {
        key: "DISSORA_BOT_NAME",
        description: "Bot kullanici adi olarak zorlanir.",
        secret: false
    },
    {
        key: "DISSORA_STATUS",
        description: BOT_STATUSES.join(" | "),
        secret: false
    },
    {
        key: "DISSORA_ACTIVITY_TYPE",
        description: ACTIVITY_TYPES.join(" | "),
        secret: false
    },
    {
        key: "DISSORA_ACTIVITY_NAME",
        description: "Aktivite metni.",
        secret: false
    },
    {
        key: "DISSORA_INTENTS",
        description: "Virgulle ayrilmis intent listesi.",
        secret: false
    },
    {
        key: "DISSORA_COMMAND_SCOPE",
        description: COMMAND_SCOPES.join(" | "),
        secret: false
    },
    {
        key: "DISSORA_PRUNE_STALE",
        description: "Kayitli ama dosyada olmayan komutlar silinsin mi?",
        secret: false
    },
    {
        key: "DISSORA_OWNERS",
        description: "Virgulle ayrilmis bot sahibi id listesi.",
        secret: false
    },
    {
        key: "DISSORA_LOCALE",
        description: "Varsayilan dil kodu.",
        secret: false
    },
    {
        key: "DISSORA_NO_COLOR",
        description: "1 veya true ise renkler kapatilir.",
        secret: false
    }
];

function readString(
    env: NodeJS.ProcessEnv,
    key: string,
    issues: ConfigIssue[]
): string | null {
    const value = env[key];

    if (value === undefined) {
        return null;
    }

    if (typeof value !== "string") {
        issues.push({
            path: key,
            message: "string olmali"
        });

        return null;
    }

    const trimmed = value.trim();

    return trimmed === "" ? null : trimmed;
}

function readList(
    env: NodeJS.ProcessEnv,
    key: string,
    issues: ConfigIssue[]
): string[] | null {
    const value = readString(env, key, issues);

    if (value === null) {
        return null;
    }

    return value
        .split(/[\s,]+/u)
        .map(entry => entry.trim())
        .filter(entry => entry !== "");
}

export function readEnv(env: NodeJS.ProcessEnv, source = ".env"): EnvConfig {
    const issues: ConfigIssue[] = [];

    const token =
        readString(env, "DISSORA_TOKEN", issues) ??
        readString(env, "DISCORD_TOKEN", issues);

    const guildId =
        readString(env, "DISSORA_GUILD_ID", issues) ??
        readString(env, "DISCORD_GUILD_ID", issues);
    const level = readString(env, "DISSORA_LOG_LEVEL", issues);
    const timestamps = readString(env, "DISSORA_LOG_TIMESTAMPS", issues);
    const status = readString(env, "DISSORA_STATUS", issues);
    const activityType = readString(env, "DISSORA_ACTIVITY_TYPE", issues);
    const scope = readString(env, "DISSORA_COMMAND_SCOPE", issues);
    const prune = readString(env, "DISSORA_PRUNE_STALE", issues);
    const noColor = readString(env, "DISSORA_NO_COLOR", issues);

    const result: EnvConfig = {
        token,
        guildId,
        modulesDir: readString(env, "DISSORA_MODULES_DIR", issues) ?? "Modules",
        logLevel:
            level === null
                ? null
                : asOneOf(
                      level,
                      "DISSORA_LOG_LEVEL",
                      LOG_LEVELS,
                      issues,
                      "info"
                  ),
        logTimestamps:
            timestamps === null
                ? null
                : asBoolean(
                      timestamps,
                      "DISSORA_LOG_TIMESTAMPS",
                      issues,
                      false
                  ),
        botName: readString(env, "DISSORA_BOT_NAME", issues),
        status:
            status === null
                ? null
                : asOneOf(
                      status,
                      "DISSORA_STATUS",
                      BOT_STATUSES,
                      issues,
                      "online"
                  ),
        activityType:
            activityType === null
                ? null
                : asOneOf(
                      activityType,
                      "DISSORA_ACTIVITY_TYPE",
                      ACTIVITY_TYPES,
                      issues,
                      "playing"
                  ),
        activityName: readString(env, "DISSORA_ACTIVITY_NAME", issues),
        intents: readList(env, "DISSORA_INTENTS", issues),
        commandScope:
            scope === null
                ? null
                : asOneOf(
                      scope,
                      "DISSORA_COMMAND_SCOPE",
                      COMMAND_SCOPES,
                      issues,
                      "auto"
                  ),
        pruneStale:
            prune === null
                ? null
                : asBoolean(prune, "DISSORA_PRUNE_STALE", issues, true),
        owners: readList(env, "DISSORA_OWNERS", issues),
        locale: readString(env, "DISSORA_LOCALE", issues),
        noColor: asBoolean(noColor, "DISSORA_NO_COLOR", issues, false)
    };

    // Donusumler de issue uretebilir; dogrulama en sonda yapilir.
    throwIfInvalid(source, issues);

    return result;
}

export function maskSecret(value: string | null): string {
    if (value === null || value === "") {
        return "-";
    }

    if (value.length <= 8) {
        return "*".repeat(value.length);
    }

    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
