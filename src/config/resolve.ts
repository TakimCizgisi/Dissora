/**
 * Katmanli config cozumlemesi.
 *
 *   varsayilanlar  ->  BotConfig.json  ->  .env  ->  calisma zamani override
 *
 * `dissora config show` bu katmanlari tek tek raporlar, `dissora config set`
 * ise dogru dosyaya yazar.
 */

import type { Logger } from "../services/Logger.js";
import { ProjectPaths } from "../services/Paths.js";
import { readJsonFile } from "../utils/fs.js";
import {
    type BotConfig,
    DEFAULT_BOT_CONFIG,
    parseBotConfig
} from "./bot-config.js";
import { type EnvConfig, maskSecret, readEnv } from "./env.js";
import { readEnvFile } from "./env-file.js";

export type ConfigLayer = "default" | "file" | "env" | "runtime";

export interface ResolvedConfig {
    readonly bot: BotConfig;
    readonly env: EnvConfig;
    readonly projectPath: string;
    readonly modulesDirName: string;
    readonly modulesDir: string;
    readonly token: string | null;
    readonly guildId: string | null;
    readonly sources: Readonly<Record<ConfigLayer, string>>;
}

export interface ConfigServiceOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly logger?: Logger;
    /** Calisma zamani override (testler ve gelistirme icin). */
    readonly overrides?: Partial<BotConfig>;
    /** .env dosyasi okunmadan dogrudan process.env kullanilsin mi? */
    readonly skipDotenv?: boolean;
}

export interface ConfigSnapshot {
    readonly resolved: ResolvedConfig;
    readonly env: Record<string, string | null>;
    readonly botFile: unknown;
    readonly envFile: Record<string, string | null>;
}

function applyEnvOverrides(base: BotConfig, env: EnvConfig): BotConfig {
    return {
        ...base,
        botName: env.botName ?? base.botName,
        status: env.status ?? base.status,
        activity: {
            ...base.activity,
            type: env.activityType ?? base.activity.type,
            name: env.activityName ?? base.activity.name
        },
        intents: env.intents ?? base.intents,
        commands: {
            ...base.commands,
            scope: env.commandScope ?? base.commands.scope,
            pruneStale: env.pruneStale ?? base.commands.pruneStale
        },
        logging: {
            ...base.logging,
            level: env.logLevel ?? base.logging.level,
            timestamps: env.logTimestamps ?? base.logging.timestamps
        },
        owners: env.owners ?? base.owners,
        locale: env.locale ?? base.locale
    };
}

function mergeOverrides(
    base: BotConfig,
    overrides: Partial<BotConfig>
): BotConfig {
    return {
        ...base,
        ...overrides,
        activity: { ...base.activity, ...(overrides.activity ?? {}) },
        commands: { ...base.commands, ...(overrides.commands ?? {}) },
        logging: { ...base.logging, ...(overrides.logging ?? {}) }
    };
}

function maskEnvValues(env: NodeJS.ProcessEnv): Record<string, string | null> {
    const out: Record<string, string | null> = {};

    for (const [key, value] of Object.entries(env)) {
        out[key] = /token|secret|password/i.test(key)
            ? maskSecret(value ?? null)
            : (value ?? null);
    }

    return out;
}

export class ConfigService {
    readonly paths: ProjectPaths;

    private readonly env: NodeJS.ProcessEnv;

    private readonly envFileValues: Record<string, string | null>;

    private readonly botFileValue: unknown;

    private readonly logger: Logger | undefined;

    private readonly overrides: Partial<BotConfig> | undefined;

    private readonly skipDotenv: boolean;

    constructor(projectPath: string, options: ConfigServiceOptions = {}) {
        this.paths = new ProjectPaths(projectPath);
        this.env = options.env ?? process.env;
        this.logger = options.logger;
        this.overrides = options.overrides;
        this.skipDotenv = options.skipDotenv ?? false;

        this.envFileValues = this.skipDotenv
            ? {}
            : readEnvFile(this.paths.envFile);
        this.botFileValue = this.readBotFile();
    }

    private readBotFile(): unknown {
        if (!this.paths.hasBotConfig()) {
            return null;
        }

        try {
            return readJsonFile(this.paths.botConfigFile);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            throw new Error(
                `${this.paths.botConfigFile} okunamadi: ${message}`
            );
        }
    }

    /**
     * `.env` dosyasi ile process.env birlestirir.
     *
     * Oncelik sirasi: varsayilan -> BotConfig.json -> `.env` -> process.env.
     * Gercek ortam degiskenleri dosya degerlerini **ezer** (dotenv geleneigi);
     * `.env` icindeki bos degerler de zaten tanimli sayilmaz.
     */
    private mergedEnv(): NodeJS.ProcessEnv {
        const merged: NodeJS.ProcessEnv = {};

        for (const [key, value] of Object.entries(this.envFileValues)) {
            if (value !== null && value !== "") {
                merged[key] = value;
            }
        }

        for (const [key, value] of Object.entries(this.env)) {
            if (value !== undefined) {
                merged[key] = value;
            }
        }

        return merged;
    }

    hasEnvFile(): boolean {
        return Object.keys(this.envFileValues).length > 0;
    }

    resolve(): ResolvedConfig {
        const env = readEnv(this.mergedEnv(), this.paths.envFile);

        const fileConfig =
            this.botFileValue === null
                ? DEFAULT_BOT_CONFIG
                : parseBotConfig(this.botFileValue, this.paths.botConfigFile);

        const withEnv = applyEnvOverrides(fileConfig, env);
        const bot = this.overrides
            ? mergeOverrides(withEnv, this.overrides)
            : withEnv;

        const modulesDirName = env.modulesDir;
        const modulesDir = this.paths.resolveInside(modulesDirName);

        if (this.logger) {
            this.logger.debug(
                `config: ${this.paths.botConfigFile}${
                    this.paths.hasBotConfig() ? "" : " (yok)"
                } + ${this.paths.envFile}${this.hasEnvFile() ? "" : " (yok)"}`
            );
        }

        return {
            bot,
            env,
            projectPath: this.paths.root,
            modulesDirName,
            modulesDir,
            token: env.token,
            guildId: env.guildId,
            sources: {
                default: "src/config/bot-config.ts",
                file: this.paths.hasBotConfig()
                    ? this.paths.botConfigFile
                    : "(yok)",
                env: this.hasEnvFile() ? this.paths.envFile : "(yok)",
                runtime: this.overrides ? "(aktif)" : "(yok)"
            }
        };
    }

    /** `dissora config show` icin: cozulmus config + dosyalardaki ham degerler. */
    snapshot(): ConfigSnapshot {
        return {
            resolved: this.resolve(),
            env: maskEnvValues(this.mergedEnv()),
            botFile: this.botFileValue,
            envFile: this.envFileValues
        };
    }

    rawEnv(): NodeJS.ProcessEnv {
        return this.mergedEnv();
    }

    botFile(): unknown {
        return this.botFileValue;
    }
}
