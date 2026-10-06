/**
 * CLI ortak yardimcilari: arguman ayristirma, renkli cikti, banner.
 */

import { isSafeName } from "../config/module-config.js";
import { NpmError } from "../services/PackageService.js";
import { renderBanner } from "../utils/branding.js";
import { getStyler } from "../utils/colors.js";

export interface ParsedArgs {
    /** `--anahtar` veya `--anahtar=deger`; deger yoksa `true`. */
    readonly flags: Readonly<Record<string, string | boolean>>;
    /** Tekrarlanabilir bayraklarin tum degerleri (`--requires A --requires B`). */
    readonly lists: Readonly<Record<string, readonly string[]>>;
    /** Konumsal argumanlar. */
    readonly positionals: readonly string[];
}

/**
 * Deger almayan bayraklar.
 *
 * Bunlar `--ts my-bot` yazildiginda `my-bot`'i **yutmaz**; eski ayristirici
 * bu yuzden `dissora --no-banner dev` komutunu `start` olarak calistiriyordu.
 * `--no-` onekli karsiliklari de burada: `--no-sync` -> `sync: false`.
 */
const BOOLEAN_FLAGS: ReadonlySet<string> = new Set([
    "ts",
    "js",
    "sync",
    "no-sync",
    "no-banner",
    "no-color",
    "help",
    "h",
    "version",
    "v",
    "force"
]);

/** `--no-banner` -> `banner` eslemesi. */
const NEGATED_FLAGS: ReadonlySet<string> = new Set([
    "no-sync",
    "no-banner",
    "no-color"
]);

/** Tek tireli kisa bayraklar. */
const SHORT_FLAGS: Readonly<Record<string, string>> = {
    h: "help",
    v: "version",
    l: "log-level"
};

/** Deger bekleyen bayraklar. */
const VALUE_FLAGS: ReadonlySet<string> = new Set(["log-level", "prefix"]);

function asBoolean(value: string): boolean {
    return value !== "false" && value !== "0" && value !== "";
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
    const flags: Record<string, string | boolean> = {};
    const lists: Record<string, string[]> = {};
    const positionals: string[] = [];

    const addValue = (name: string, value: string): void => {
        const bucket = lists[name] ?? [];

        lists[name] = bucket;
        bucket.push(value);
        flags[name] ??= value;
    };

    for (let index = 0; index < argv.length; index++) {
        const token = argv[index] ?? "";

        if (token === "--") {
            positionals.push(...argv.slice(index + 1));
            break;
        }

        if (!token.startsWith("-") || token === "-") {
            positionals.push(token);
            continue;
        }

        const isLong = token.startsWith("--");
        const body = (isLong ? token.slice(2) : token.slice(1)).replace(
            /^-+/,
            ""
        );
        const eq = body.indexOf("=");
        const rawName = eq === -1 ? body : body.slice(0, eq);
        const inline = eq === -1 ? null : body.slice(eq + 1);

        // `-1`, `-5` gibi degerler bayrak degildir.
        if (!isLong && /^\d/.test(rawName)) {
            positionals.push(token);
            continue;
        }

        const name = isLong ? rawName : (SHORT_FLAGS[rawName] ?? rawName);

        if (name === "") {
            positionals.push(token);
            continue;
        }

        if (VALUE_FLAGS.has(name)) {
            if (inline !== null) {
                flags[name] = inline;
                continue;
            }

            const next = argv[index + 1];

            if (next !== undefined && !next.startsWith("-")) {
                flags[name] = next;
                index++;
                continue;
            }

            flags[name] = "";
            continue;
        }

        if (NEGATED_FLAGS.has(name)) {
            if (inline !== null) {
                flags[name] = asBoolean(inline);
                flags[name.slice(3)] = flags[name];
                continue;
            }

            flags[name] = false;
            flags[name.slice(3)] = false;
            continue;
        }

        if (BOOLEAN_FLAGS.has(name)) {
            flags[name] = inline === null ? true : asBoolean(inline);
            continue;
        }

        // Bilinmeyen bayrak: `--requires A` gibi deger kabul eder ve
        // tekrarlanabilir (`--requires A --requires B` ikisini de korur).
        if (inline !== null) {
            addValue(name, inline);
            continue;
        }

        const next = argv[index + 1];

        if (next !== undefined && !next.startsWith("-")) {
            addValue(name, next);
            index++;
            continue;
        }

        flags[name] = true;
    }

    return { flags, lists, positionals };
}

export function flagString(args: ParsedArgs, name: string): string | null {
    const value = args.flags[name];

    if (typeof value === "string") {
        return value === "" ? null : value;
    }

    const list = args.lists[name];

    return list === undefined ? null : (list[list.length - 1] ?? null);
}

export function flagBool(args: ParsedArgs, name: string): boolean {
    const value = args.flags[name];

    if (typeof value === "string") {
        return asBoolean(value);
    }

    return value === true;
}

/** `--requires A,B` veya `--requires A --requires B` degerlerini diziye cevirir. */
export function flagList(args: ParsedArgs, name: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();

    for (const raw of args.lists[name] ?? []) {
        for (const part of raw.split(",")) {
            const trimmed = part.trim();

            if (trimmed !== "" && !seen.has(trimmed)) {
                seen.add(trimmed);
                out.push(trimmed);
            }
        }
    }

    return out;
}

export function requireSafeName(value: string, label: string): string {
    if (!isSafeName(value)) {
        throw new Error(
            `Gecersiz ${label}: "${value}". Yalnizca harf, rakam, nokta, _ ve - kullanilabilir; harf/rakam ile baslamalidir.`
        );
    }

    return value;
}

export function out(message: string): void {
    process.stdout.write(`${message}\n`);
}

export function printBanner(): void {
    out(renderBanner());
}

export function heading(text: string): void {
    const styler = getStyler();

    out("");
    out(styler.hex("#5865f2", styler.bold(text)));
    out("");
}

export function keyValue(key: string, value: string): void {
    const styler = getStyler();

    out(`  ${styler.dim(`${key.padEnd(16)}`)} ${value}`);
}

export function success(message: string): void {
    const styler = getStyler();

    out(`${styler.hex("#22c55e", "✓")} ${message}`);
}

export function failure(message: string): void {
    const styler = getStyler();

    process.stderr.write(`${styler.hex("#ef4444", "✖")} ${message}\n`);
}

/**
 * Hata mesajini tek noktadan yazdirir.
 *
 * `NpmError` icin npm'in gercek stderr satiri ve cikis kodu gosterilir;
 * `Command failed: npm.cmd view ...` gibi anlamsiz mesajlar kullaniciya
 * birakilmaz.
 */
export function reportError(error: unknown): void {
    if (error instanceof NpmError) {
        failure(error.message);

        if (error.code !== null) {
            const styler = getStyler();

            process.stderr.write(`${styler.dim(`  npm exit ${error.code}`)}\n`);
        }

        return;
    }

    failure(error instanceof Error ? error.message : String(error));
}
