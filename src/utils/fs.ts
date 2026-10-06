import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    statSync
} from "node:fs";
import { resolve } from "node:path";

export const SCRIPT_EXTENSIONS: readonly string[] = [
    ".js",
    ".cjs",
    ".mjs",
    ".ts",
    ".cts",
    ".mts"
];

export function isScriptFile(file: string): boolean {
    return scriptExtensionOf(file) !== "";
}

export function scriptExtensionOf(file: string): string {
    const lower = file.toLowerCase();

    for (const extension of SCRIPT_EXTENSIONS) {
        if (lower.endsWith(extension)) {
            return extension;
        }
    }

    return "";
}

/**
 * UTF-8 BOM'unu kaldirir.
 *
 * Windows PowerShell 5.1'in `Out-File`/`Set-Content -Encoding UTF8`
 * komutlari ve bazi araclar dosya basina BOM yazar. npm bunu tolere
 * ediyor, `JSON.parse` ise reddediyor.
 */
export function stripBom(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * JSON.parse sirasinda `//` ve `/* *\/` yorumlarina izin verir.
 * BotConfig.json ve moduleconfig.json elle duzenlendigi icin yorumlu
 * dosyalari da kabul etmek kullanici dostu.
 */
export function stripJsonComments(text: string): string {
    const source = stripBom(text);
    let out = "";
    let inString = false;
    let inLine = false;
    let inBlock = false;

    for (let index = 0; index < source.length; index++) {
        const char = source[index] ?? "";
        const next = source[index + 1] ?? "";

        if (inLine) {
            if (char === "\n") {
                inLine = false;
                out += char;
            }

            continue;
        }

        if (inBlock) {
            if (char === "*" && next === "/") {
                inBlock = false;
                index++;
            }

            continue;
        }

        if (inString) {
            out += char;

            if (char === "\\") {
                out += next;
                index++;
                continue;
            }

            if (char === '"') {
                inString = false;
            }

            continue;
        }

        if (char === '"') {
            inString = true;
            out += char;
            continue;
        }

        if (char === "/" && next === "/") {
            inLine = true;
            index++;
            continue;
        }

        if (char === "/" && next === "*") {
            inBlock = true;
            index++;
            continue;
        }

        out += char;
    }

    return out;
}

export function readJsonFile(file: string): unknown {
    return JSON.parse(stripJsonComments(readFileSync(file, "utf8")));
}

/** Dosya bos veya yalnizca BOM iceriyorsa `{}` doner. */
export function readJsonFileOrEmpty(file: string): unknown {
    const text = stripBom(readFileSync(file, "utf8")).trim();

    return text === "" ? {} : JSON.parse(stripJsonComments(text));
}

/** Yorumlari ve bosluklari atlayarak verilen indekse gecirir. */
function skipWs(text: string, from: number): number {
    let index = from;

    for (;;) {
        const char = text[index];

        if (char === undefined) {
            return index;
        }

        if (char === " " || char === "\t" || char === "\n" || char === "\r") {
            index++;
            continue;
        }

        if (char === "/" && text[index + 1] === "/") {
            while (index < text.length && text[index] !== "\n") {
                index++;
            }

            continue;
        }

        if (char === "/" && text[index + 1] === "*") {
            index += 2;

            while (
                index < text.length &&
                !(text[index] === "*" && text[index + 1] === "/")
            ) {
                index++;
            }

            index += 2;
            continue;
        }

        return index;
    }
}

/** `start` indeksi acilan tirnak olan dizeyi bitirir. */
function stringEnd(text: string, start: number): number {
    let index = start + 1;

    while (index < text.length) {
        const char = text[index];

        if (char === "\\") {
            index += 2;
            continue;
        }

        if (char === '"') {
            return index + 1;
        }

        index++;
    }

    return text.length;
}

/** `start` ile baslayan JSON degerinin sonunu (dahil) bulur. */
function valueEnd(text: string, start: number): number {
    const char = text[start];

    if (char === '"') {
        return stringEnd(text, start);
    }

    if (char === "{" || char === "[") {
        let depth = 0;
        let inString = false;
        let index = start;

        while (index < text.length) {
            const current = text[index];

            if (inString) {
                if (current === "\\") {
                    index += 2;
                    continue;
                }

                if (current === '"') {
                    inString = false;
                }

                index++;
                continue;
            }

            if (current === '"') {
                inString = true;
            } else if (current === "{" || current === "[") {
                depth++;
            } else if (current === "}" || current === "]") {
                depth--;

                if (depth === 0) {
                    return index + 1;
                }
            }

            index++;
        }

        return text.length;
    }

    // true / false / null / sayi
    let index = start;

    while (
        index < text.length &&
        !["}", "]", ",", " ", "\t", "\n", "\r"].includes(text[index] ?? "")
    ) {
        index++;
    }

    return index;
}

/**
 * JSON metninde **ust seviyedeki** bir anahtarin degerini, yorumlari ve
 * girintiyi bozmadan degistirir.
 *
 * `module enable/disable` once `JSON.parse` + `JSON.stringify` yapiyordu;
 * bu ise elle duzenlenmis, yorumlu `moduleconfig.json` icinde kullanici
 * yorumlarini **siliyordu**. Burada orijinal metin korunur ve yalnizca
 * degerin kendisi degisir.
 *
 * @returns Anahtar yoksa `{}` olarak islenmis orijinal metin doner.
 */
export function setTopLevelValue(
    rawText: string,
    key: string,
    encoded: string
): string {
    const text = stripBom(rawText);
    let index = skipWs(text, 0);

    if (text[index] !== "{") {
        return text;
    }

    index++;

    for (;;) {
        index = skipWs(text, index);

        const char = text[index];

        if (char === undefined || char === "}") {
            break;
        }

        if (char === ",") {
            index++;
            continue;
        }

        if (char !== '"') {
            break;
        }

        const nameEnd = stringEnd(text, index);
        const name = text.slice(index + 1, nameEnd - 1);
        let position = skipWs(text, nameEnd);

        if (text[position] !== ":") {
            break;
        }

        position = skipWs(text, position + 1);

        const end = valueEnd(text, position);

        if (name === key) {
            return `${text.slice(0, position)}${encoded}${text.slice(end)}`;
        }

        index = end;
    }

    // Anahtar yok: son kapanis parantezinden once ekle.
    const closing = text.lastIndexOf("}");

    if (closing === -1) {
        return text;
    }

    const body = text.slice(0, closing);
    const trimmed = body.replace(/\s+$/, "");
    const separator = trimmed.trimEnd().endsWith("{") ? "" : ",";

    return `${trimmed}${separator}\n    "${key}": ${encoded}\n${text.slice(closing)}`;
}

export function listDirectories(root: string): string[] {
    if (!existsSync(root)) {
        return [];
    }

    return readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b));
}

export function listFiles(root: string): string[] {
    if (!existsSync(root)) {
        return [];
    }

    return readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b));
}

/**
 * Bir modul klasorunde verilen dosya yolunu cozer.
 *
 * Oncelik sirasi:
 *   1. verilen yol oldugu gibi
 *   2. uzantisi degistirilmis halleri (index.js -> index.ts)
 *   3. uzantisi eklenmis halleri (index -> index.js / index.ts)
 */
export function resolveScriptFile(
    folder: string,
    entry: string
): string | null {
    const direct = resolve(folder, entry);

    if (existsSync(direct) && statSync(direct).isFile()) {
        return direct;
    }

    const current = scriptExtensionOf(entry);

    if (current !== "") {
        const base = entry.slice(0, entry.length - current.length);

        for (const extension of SCRIPT_EXTENSIONS) {
            if (extension === current) {
                continue;
            }

            const candidate = resolve(folder, `${base}${extension}`);

            if (existsSync(candidate) && statSync(candidate).isFile()) {
                return candidate;
            }
        }
    }

    for (const extension of SCRIPT_EXTENSIONS) {
        const candidate = resolve(folder, `${entry}${extension}`);

        if (existsSync(candidate) && statSync(candidate).isFile()) {
            return candidate;
        }
    }

    return null;
}

export function ensureDir(dir: string): void {
    mkdirSync(dir, { recursive: true });
}
