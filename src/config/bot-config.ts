/**
 * BotConfig.json semasi.
 *
 * Cozumleme katmani (varsayilan -> BotConfig.json -> .env -> runtime):
 *   src/config/resolve.ts
 */

import {
    asBoolean,
    asOneOf,
    asOptionalString,
    asString,
    asStringArray,
    type ConfigIssue,
    isPlainObject,
    issue,
    throwIfInvalid
} from "./errors.js";

export const BOT_STATUSES = ["online", "idle", "dnd", "invisible"] as const;

export const ACTIVITY_TYPES = [
    "playing",
    "streaming",
    "listening",
    "watching",
    "competing",
    "custom"
] as const;

export const COMMAND_SCOPES = ["auto", "guild", "global"] as const;

export type BotStatus = (typeof BOT_STATUSES)[number];

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type CommandScope = (typeof COMMAND_SCOPES)[number];

export interface BotActivityConfig {
    readonly type: ActivityType;
    readonly name: string;
    readonly url: string | null;
    readonly state: string | null;
}

export interface BotCommandsConfig {
    readonly register: boolean;
    readonly pruneStale: boolean;
    readonly scope: CommandScope;
}

export interface BotLoggingConfig {
    readonly level: string;
    readonly timestamps: boolean;
}

export interface BotConfig {
    readonly botName: string | null;
    readonly status: BotStatus;
    readonly activity: BotActivityConfig;
    readonly intents: readonly string[];
    readonly commands: BotCommandsConfig;
    readonly logging: BotLoggingConfig;
    readonly owners: readonly string[];
    readonly locale: string;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
    botName: null,
    status: "online",
    activity: {
        type: "watching",
        name: "Dissora",
        url: null,
        state: null
    },
    intents: ["Guilds", "GuildMessages"],
    commands: {
        register: true,
        pruneStale: true,
        scope: "auto"
    },
    logging: {
        level: "info",
        timestamps: false
    },
    owners: [],
    locale: "tr"
};

export const KNOWN_INTENTS: readonly string[] = [
    "Guilds",
    "GuildMembers",
    "GuildModeration",
    "GuildExpressions",
    "GuildIntegrations",
    "GuildWebhooks",
    "GuildInvites",
    "GuildVoiceStates",
    "GuildPresences",
    "GuildMessages",
    "GuildMessageTyping",
    "GuildMessageReactions",
    "GuildMessageContent",
    "GuildMessageAttachments",
    "DirectMessages",
    "DirectMessageReactions",
    "DirectMessageTyping",
    "MessageContent",
    "GuildScheduledEvents",
    "AutoModerationConfiguration",
    "AutoModerationExecution"
];

function parseActivity(raw: unknown, issues: ConfigIssue[]): BotActivityConfig {
    if (raw === undefined || raw === null) {
        return DEFAULT_BOT_CONFIG.activity;
    }

    if (!isPlainObject(raw)) {
        issues.push(issue("activity", "obje olmali"));

        return DEFAULT_BOT_CONFIG.activity;
    }

    return {
        type: asOneOf(
            raw.type,
            "activity.type",
            ACTIVITY_TYPES,
            issues,
            DEFAULT_BOT_CONFIG.activity.type
        ),
        name:
            asOptionalString(raw.name, "activity.name", issues) ??
            asOptionalString(raw.text, "activity.text", issues) ??
            DEFAULT_BOT_CONFIG.activity.name,
        url: asOptionalString(raw.url, "activity.url", issues) ?? null,
        state: asOptionalString(raw.state, "activity.state", issues) ?? null
    };
}

function parseCommands(raw: unknown, issues: ConfigIssue[]): BotCommandsConfig {
    if (raw === undefined || raw === null) {
        return DEFAULT_BOT_CONFIG.commands;
    }

    if (!isPlainObject(raw)) {
        issues.push(issue("commands", "obje olmali"));

        return DEFAULT_BOT_CONFIG.commands;
    }

    return {
        register: asBoolean(
            raw.register,
            "commands.register",
            issues,
            DEFAULT_BOT_CONFIG.commands.register
        ),
        pruneStale: asBoolean(
            raw.pruneStale,
            "commands.pruneStale",
            issues,
            DEFAULT_BOT_CONFIG.commands.pruneStale
        ),
        scope: asOneOf(
            raw.scope,
            "commands.scope",
            COMMAND_SCOPES,
            issues,
            DEFAULT_BOT_CONFIG.commands.scope
        )
    };
}

function parseLogging(raw: unknown, issues: ConfigIssue[]): BotLoggingConfig {
    if (raw === undefined || raw === null) {
        return DEFAULT_BOT_CONFIG.logging;
    }

    if (!isPlainObject(raw)) {
        issues.push(issue("logging", "obje olmali"));

        return DEFAULT_BOT_CONFIG.logging;
    }

    return {
        level:
            asOptionalString(raw.level, "logging.level", issues) ??
            DEFAULT_BOT_CONFIG.logging.level,
        timestamps: asBoolean(
            raw.timestamps,
            "logging.timestamps",
            issues,
            DEFAULT_BOT_CONFIG.logging.timestamps
        )
    };
}

export function parseBotConfig(
    raw: unknown,
    source = "BotConfig.json"
): BotConfig {
    if (raw === undefined || raw === null) {
        return DEFAULT_BOT_CONFIG;
    }

    if (!isPlainObject(raw)) {
        throwIfInvalid(source, [issue("(dosya)", "obje olmali")]);
        return DEFAULT_BOT_CONFIG;
    }

    const issues: ConfigIssue[] = [];

    const intents = asStringArray(raw.intents, "intents", issues);

    for (let index = 0; index < intents.length; index++) {
        const name = intents[index] ?? "";

        if (!KNOWN_INTENTS.includes(name)) {
            issues.push(
                issue(
                    `intents[${index}]`,
                    `"${name}" gecersiz intent. Izin verilenler: ${KNOWN_INTENTS.join(", ")}`
                )
            );
        }
    }

    const config: BotConfig = {
        botName: asOptionalString(raw.botName, "botName", issues) ?? null,
        status: asOneOf(
            raw.status,
            "status",
            BOT_STATUSES,
            issues,
            DEFAULT_BOT_CONFIG.status
        ),
        activity: parseActivity(raw.activity, issues),
        intents: intents.length > 0 ? intents : DEFAULT_BOT_CONFIG.intents,
        commands: parseCommands(raw.commands, issues),
        logging: parseLogging(raw.logging, issues),
        owners: asStringArray(raw.owners, "owners", issues),
        locale:
            asString(raw.locale, "locale", issues) ?? DEFAULT_BOT_CONFIG.locale
    };

    throwIfInvalid(source, issues);

    return config;
}
