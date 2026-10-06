/**
 * `dissora config` - yapilandirma yonetimi.
 *
 *   dissora config show       cozulmus config + katman kaynaklari
 *   dissora config path       dosya yollari
 *   dissora config validate   dogrulama (hata varsa exit 1)
 *   dissora config get <anahtar>
 *   dissora config set <anahtar> <deger>
 *
 * `set` hangi dosyaya yazacagini `BotConfig.json` ve `.env` arasinda
 * otomatik secer: BotConfig alanlari JSON'a, ortam degiskenleri `.env`'e.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

import {
    type BotConfig,
    DEFAULT_BOT_CONFIG,
    parseBotConfig
} from "../config/bot-config.js";
import { ConfigService } from "../config/resolve.js";
import { isLogLevel } from "../services/Logger.js";
import { getStyler } from "../utils/colors.js";
import { readJsonFile } from "../utils/fs.js";
import {
    failure,
    heading,
    keyValue,
    out,
    type ParsedArgs,
    parseArgs,
    success
} from "./utils.js";

/** `set` ile duzenlenebilen BotConfig alanlari ve tipi. */
const WRITABLE: Readonly<Record<string, "string" | "boolean" | "string[]">> = {
    botName: "string",
    status: "string",
    locale: "string",
    intents: "string[]",
    owners: "string[]",
    "activity.type": "string",
    "activity.name": "string",
    "activity.url": "string",
    "activity.state": "string",
    "commands.register": "boolean",
    "commands.pruneStale": "boolean",
    "commands.scope": "string",
    "logging.level": "string",
    "logging.timestamps": "boolean"
};

/**
 * `set` ile duzenlenebilen ortam degiskenleri (`.env`e yazilir).
 *
 * Bu liste `WRITABLE` ile **kasitli olarak** ortusur (`botName`, `status`,
 * `intents`, `owners`, `locale`): ayni ayar hem JSON'a hem `.env`'e
 * yazilabilir. `set` her zaman `BotConfig.json`'u tercih eder; `.env`
 * kaynaklari elle duzenlemek icin desteklenir.
 */
const ENV_KEYS: Readonly<Record<string, string>> = {
    token: "DISSORA_TOKEN",
    guildId: "DISSORA_GUILD_ID",
    modulesDir: "DISSORA_MODULES_DIR",
    logLevel: "DISSORA_LOG_LEVEL",
    logTimestamps: "DISSORA_LOG_TIMESTAMPS",
    commandScope: "DISSORA_COMMAND_SCOPE",
    pruneStale: "DISSORA_PRUNE_STALE",
    botName: "DISSORA_BOT_NAME",
    status: "DISSORA_STATUS",
    activityType: "DISSORA_ACTIVITY_TYPE",
    activityName: "DISSORA_ACTIVITY_NAME",
    intents: "DISSORA_INTENTS",
    owners: "DISSORA_OWNERS",
    locale: "DISSORA_LOCALE"
};

/** `get` ciktisinda maskelenmesi gereken anahtarlar. */
const SECRET_KEYS: ReadonlySet<string> = new Set(["token", "guildId"]);

function readBotFile(path: string): Record<string, unknown> {
    if (!existsSync(path)) {
        return {};
    }

    const raw: unknown = readJsonFile(path);

    return raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
}

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 4)}\n`, "utf8");
}

function setPath(
    target: Record<string, unknown>,
    dotted: string,
    value: unknown
): void {
    const parts = dotted.split(".");
    let current = target;

    for (let index = 0; index < parts.length - 1; index++) {
        const key = parts[index] as string;
        const next = current[key];

        if (next === undefined || next === null || typeof next !== "object") {
            current[key] = {};
        }

        current = current[key] as Record<string, unknown>;
    }

    current[parts[parts.length - 1] as string] = value;
}

function readPath(source: unknown, dotted: string): unknown {
    let current: unknown = source;

    for (const part of dotted.split(".")) {
        if (current === null || typeof current !== "object") {
            return undefined;
        }

        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

function render(value: unknown): string {
    const styler = getStyler();

    if (value === null || value === undefined) {
        return styler.dim("(bos)");
    }

    if (Array.isArray(value)) {
        return value.length > 0 ? value.join(", ") : styler.dim("(bos)");
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
}

function showCommand(projectPath: string): void {
    const service = new ConfigService(projectPath);
    const snapshot = service.snapshot();
    const { bot, env } = snapshot.resolved;
    const styler = getStyler();

    heading("Cozulmus bot yapilandirmasi");
    keyValue("botName", render(bot.botName));
    keyValue("status", render(bot.status));
    keyValue(
        "activity",
        `${render(bot.activity.type)} ${styler.dim("/")} ${render(bot.activity.name)}`
    );
    keyValue("intents", render(bot.intents));
    keyValue("commands.register", render(bot.commands.register));
    keyValue("commands.scope", render(bot.commands.scope));
    keyValue("commands.pruneStale", render(bot.commands.pruneStale));
    keyValue("logging.level", render(bot.logging.level));
    keyValue("logging.timestamps", render(bot.logging.timestamps));
    keyValue("owners", render(bot.owners));
    keyValue("locale", render(bot.locale));

    heading("Ortam");
    // `resolved.env` ham degerler icerir; token ekrana **maskesiz**
    // basilmamali (onceki kod sifreyi duz metin yaziyordu).
    keyValue("token", render(env.token === null ? null : mask(env.token)));
    keyValue("guildId", render(env.guildId));
    keyValue("modulesDir", render(env.modulesDir));
    keyValue("logLevel", render(env.logLevel));
    keyValue("logTimestamps", render(env.logTimestamps));

    heading("Katman kaynaklari");

    for (const [layer, source] of Object.entries(snapshot.resolved.sources)) {
        keyValue(layer, render(source));
    }
}

/**
 * Gizli degeri maskeler.
 *
 * Token'in herhangi bir parcasi gosterilmez: `config get token` ciktisi
 * ekran goruntusu, hata raporu ya da sohbet kanalina yapistirilabilir.
 * Kac karakter oldugu bilmek dogrulama icin yeterlidir.
 */
function mask(secret: string): string {
    return getStyler().dim(`**** (${secret.length} karakter)`);
}

function pathCommand(projectPath: string): void {
    const paths = new ConfigService(projectPath).paths;

    heading("Dosya yollari");
    keyValue("BotConfig.json", paths.botConfigFile);
    keyValue(".env", paths.envFile);
    keyValue("package.json", paths.packageFile);
    keyValue("Modules/", paths.modulesDir);
}

function validateCommand(projectPath: string): number {
    const service = new ConfigService(projectPath);
    const paths = service.paths;
    const problems: string[] = [];

    heading("Dogrulama");

    if (!paths.hasBotConfig()) {
        problems.push(`BotConfig.json bulunamadi (${paths.botConfigFile})`);
    } else {
        try {
            parseBotConfig(
                readJsonFile(paths.botConfigFile),
                paths.botConfigFile
            );
            keyValue("BotConfig.json", "gecerli");
        } catch (error) {
            problems.push(
                `BotConfig.json: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    if (existsSync(paths.envFile)) {
        keyValue(".env", "bulundu");
    } else {
        problems.push(`.env bulunamadi (${paths.envFile})`);
    }

    const resolved = service.resolve();

    if (resolved.token === null) {
        problems.push("DISCORD_TOKEN tanimli degil (bot baglanamaz)");
    }

    if (problems.length === 0) {
        keyValue("sonuc", "her sey yolunda");
        out("");

        return 0;
    }

    for (const problem of problems) {
        out(`  ${getStyler().hex("#ef4444", "✖")} ${problem}`);
    }

    out("");

    return 1;
}

/**
 * Tek bir deger okur.
 *
 * **Cozulmus** config okunur, ham dosya degil: `logging.level` icin `.env`
 * ya da calisma zamani override'i daha yuksek onceliktir, `get` de gercek
 * calisan degeri gostermelidir.
 */
function getCommand(projectPath: string, key: string): number {
    const service = new ConfigService(projectPath);
    const resolved = service.resolve();

    const dotted = readPath(resolved.bot, key);

    if (dotted !== undefined) {
        out(renderOutput(key, dotted));

        return 0;
    }

    const envKey = ENV_KEYS[key];
    const rawEnv = service.rawEnv();
    const envValue = envKey === undefined ? rawEnv[key] : rawEnv[envKey];

    if (envValue === undefined || envValue === null || envValue === "") {
        out(getStyler().dim(`(tanimsiz) ${key}`));

        return 1;
    }

    out(renderOutput(key, envValue));

    return 0;
}

/** Gizli degerleri ekrana cikarmadan once maskeler. */
function renderOutput(key: string, value: unknown): string {
    return SECRET_KEYS.has(key) && typeof value === "string"
        ? mask(value)
        : render(value);
}

function parseValue(
    key: string,
    raw: string,
    kind: "string" | "boolean" | "string[]"
): string | boolean | string[] {
    if (kind === "boolean") {
        const value = raw.trim().toLowerCase();

        // Onceki kod her seyi `false` yaziyordu: `dissora config set
        // logging.timestamps evet` sessizce yanlis deger kaydediyordu.
        if (["true", "1", "yes", "on"].includes(value)) {
            return true;
        }

        if (["false", "0", "no", "off"].includes(value)) {
            return false;
        }

        throw new Error(
            `boolean deger gecersiz: "${raw}" (true/false, 1/0, yes/no, on/off)`
        );
    }

    if (kind === "string[]") {
        const items = raw
            .split(",")
            .map(part => part.trim())
            .filter(part => part !== "");

        if (items.length === 0) {
            throw new Error(
                `${key} icin en az bir deger gerekli (virgulle ayir)`
            );
        }

        return items;
    }

    if (key === "logging.level" && !isLogLevel(raw.trim())) {
        throw new Error(
            `gecersiz log seviyesi: "${raw}" (trace, debug, info, warn, error, silent)`
        );
    }

    return raw;
}

/** Yazmadan once gecersiz degerleri yakalar. */
function setCommand(projectPath: string, key: string, raw: string): number {
    const paths = new ConfigService(projectPath).paths;

    if (key in WRITABLE) {
        const kind = WRITABLE[key] as "string" | "boolean" | "string[]";
        let value: string | boolean | string[];

        try {
            value = parseValue(key, raw, kind);
        } catch (error) {
            failure(error instanceof Error ? error.message : String(error));

            return 1;
        }

        // Yalnizca **istenen alan** yazilir.
        //
        // Onceki kod varsayilanlarin tamamini dosyaya yaziyordu: kullanici
        // `logging.level` degistirdiginde dosyaya onlarca alan ekleniyor ve
        // dosyadaki yorumlar/bilinmeyen anahtarlar kayboluyordu.
        const patched = readBotFile(paths.botConfigFile);

        setPath(patched, key, value);

        // Dogrulama icin varsayilanlarla birlestirilir, **yazilan** deger
        // yalnizca patch'tir.
        const validationTarget = {
            ...(structuredClone(DEFAULT_BOT_CONFIG) as unknown as BotConfig),
            ...(structuredClone(patched) as Record<string, unknown>)
        } as unknown;

        try {
            parseBotConfig(validationTarget, paths.botConfigFile);
        } catch (error) {
            failure(error instanceof Error ? error.message : String(error));

            return 1;
        }

        writeJson(paths.botConfigFile, patched);
        success(`${key} = ${render(value)}`);
        out(`  ${getStyler().dim(paths.botConfigFile)}`);

        return 0;
    }

    if (key in ENV_KEYS) {
        const envKey = ENV_KEYS[key] as string;
        const file = paths.envFile;
        const original = existsSync(file) ? readFileSync(file, "utf8") : "";

        // Windows dosyalari CRLF kullanir; satirlari yeniden yazarken son
        // satir sonu bicimi korunur, aksi halde dosya her `set` ile bozulur.
        const eol = original.includes("\r\n") ? "\r\n" : "\n";
        const hadTrailingNewline = original.endsWith("\n");
        const lines = original === "" ? [] : original.split(/\r?\n/);

        if (hadTrailingNewline) {
            lines.pop();
        }

        let replaced = false;
        const next = lines.map(line => {
            if (!line.trim().startsWith(`${envKey}=`)) {
                return line;
            }

            replaced = true;

            return `${envKey}=${raw}`;
        });

        if (!replaced) {
            next.push(`${envKey}=${raw}`);
        }

        writeFileSync(file, `${next.join(eol)}${eol}`, "utf8");
        success(`${envKey} = ${maskIfSecret(envKey, raw)}`);
        out(`  ${getStyler().dim(file)}`);

        return 0;
    }

    failure(`bilinmeyen anahtar: ${key}`);
    out(
        `  Yazilabilir alanlar: ${[
            ...Object.keys(WRITABLE),
            ...Object.keys(ENV_KEYS)
        ].join(", ")}`
    );

    return 1;
}

function maskIfSecret(key: string, value: string): string {
    return /token|secret|password/i.test(key) ? mask(value) : value;
}

export function configCommand(
    projectPath: string,
    argv: readonly string[]
): number {
    const args: ParsedArgs = parseArgs(argv);
    const sub = args.positionals[0] ?? "show";

    switch (sub) {
        case "show":
            showCommand(projectPath);
            return 0;
        case "path":
        case "paths":
            pathCommand(projectPath);
            return 0;
        case "validate":
        case "check":
            return validateCommand(projectPath);
        case "get": {
            const key = args.positionals[1];

            if (key === undefined) {
                out(`kullanim: dissora config get <anahtar>`);

                return 1;
            }

            return getCommand(projectPath, key);
        }
        case "set": {
            const key = args.positionals[1];
            const value = args.positionals.slice(2).join(" ");

            if (key === undefined || value === "") {
                out(`kullanim: dissora config set <anahtar> <deger>`);

                return 1;
            }

            return setCommand(projectPath, key, value);
        }
        default:
            out(`bilinmeyen alt komut: ${sub}`);
            out(`alt komutlar: show, path, validate, get, set`);

            return 1;
    }
}
