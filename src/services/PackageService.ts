import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const run = promisify(execFile);

export interface NpmResult {
    readonly stdout: string;
    readonly stderr: string;
}

export class NpmError extends Error {
    readonly stderr: string;

    readonly code: number | null;

    constructor(message: string, stderr: string, code: number | null) {
        super(message);
        this.name = "NpmError";
        this.stderr = stderr;
        this.code = code;
    }
}

/**
 * Windows'ta Node, `.cmd` dosyalarini shell'siz `spawn` ile calistirmayi
 * reddeder (`EINVAL`). `shell: true` deprecation uyarisi (DEP0190) yayar.
 *
 * Bu yuzden `cmd.exe` dogrudan cagrilir: ne `EINVAL` ne de arguman-kacis
 * uyarisi olusur. Argumanlar kullanici girdisi (`spec`) olabileceginden
 * once `assertSafeSpec` ile beyaz listeye gore dogrulanir.
 */
const NEEDS_CMD = process.platform === "win32";

function npmCommand(): string {
    return NEEDS_CMD ? "npm.cmd" : "npm";
}

/** `cmd.exe` icin guvenli tirnaklama (beyaz liste zaten genis karakterleri eler). */
function quoteForCmd(value: string): string {
    return /[\s"&|<>^%]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildInvocation(args: readonly string[]): {
    file: string;
    args: readonly string[];
} {
    if (!NEEDS_CMD) {
        return { file: npmCommand(), args: [...args] };
    }

    const line = [npmCommand(), ...args].map(quoteForCmd).join(" ");

    return {
        file: process.env.ComSpec ?? "cmd.exe",
        args: ["/d", "/s", "/c", line]
    };
}

const SAFE_SPEC = /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+(@[a-zA-Z0-9._^~>=<*-]+)?$/;
const SAFE_GITHUB_SPEC = /^github:[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(#.*)?$/;

/**
 * Yerel `.tgz` / `.tar.gz` yollari icin izin.
 *
 * Nitelenmemis paket adi + github kaynagi **yaygin** kullanim; ama paket
 * henuz yayinlanmamisken (ya da ekip ici dagitimde) modulu yerel
 * tarball'dan kurmak gerekiyor. Bu yuzden su iki bicim de kabul edilir.
 *
 * Beyaz liste yerine **kara liste** kullanilir: yol her karaktere
 * izin verebilir ama `cmd.exe` meta karakterleri (`%` ile degisken
 * genislemesi, `&|<>^` zincirleme, `"` kapatma, `` ` ``) asla giremez.
 * Bosluk sorun degildir: `quoteForCmd` degerleri tirnaklar.
 */
const FILE_SPEC_SUFFIX = /\.(?:tgz|tar\.gz)$/i;
const UNSAFE_FOR_CMD = /[%&|<>^"!`\r\n]/;

function isSafeFileSpec(spec: string): boolean {
    return FILE_SPEC_SUFFIX.test(spec) && !UNSAFE_FOR_CMD.test(spec);
}

/** `file:./yol.tgz` oneki varsa kirp, sonra yol denetimi yap. */
function normalizeFileSpec(spec: string): string | null {
    if (!spec.startsWith("file:")) {
        return isSafeFileSpec(spec) ? spec : null;
    }

    const path = spec.slice("file:".length).replace(/^\/\//u, "/");
    const bare = path.startsWith("file:") ? path.slice("file:".length) : path;

    return isSafeFileSpec(bare) ? bare : null;
}

/** npm'e aktarilacak paket belirtimini dogrular (shell enjeksiyon korumasi). */
export function assertSafeSpec(spec: string): void {
    if (normalizeFileSpec(spec) !== null) {
        return;
    }

    if (!SAFE_SPEC.test(spec) && !SAFE_GITHUB_SPEC.test(spec)) {
        throw new Error(
            `Gecersiz paket belirtimi: "${spec}". ` +
                "Yalnizca paket adi, @kapsam/paket, github:kullanici/repo " +
                "veya yerel .tgz / .tar.gz yolu kullanilabilir."
        );
    }
}

function describeFailure(failure: {
    message?: string;
    stderr?: string;
    stdout?: string;
    code?: number | string | null;
    killed?: boolean;
    signal?: string | null;
}): string {
    if (failure.killed === true) {
        return "npm komutu zaman asimina ugramisti (5 dakika).";
    }

    if (typeof failure.signal === "string" && failure.signal !== "") {
        return `npm komutu ${failure.signal} sinyaliyle sonlandirildi.`;
    }

    const detail =
        (failure.stderr ?? "").trim() || (failure.stdout ?? "").trim();
    const first = detail.split("\n").find(line => line.trim() !== "") ?? "";

    return first !== "" ? first : (failure.message ?? "npm komutu basarisiz");
}

/**
 * Deger alan secenekler.
 *
 * Onceki kod " `-` ile baslamayan her argumani" paket belirtimi sayiyordu;
 * `--prefix <gecici klasor>` degerini de dogruluyor ve **her** kurulumu
 * "Gecersiz paket belirtimi" ile dusuruyordu. Simdi bu degerler atlanir.
 */
const VALUE_OPTIONS: ReadonlySet<string> = new Set([
    "--prefix",
    "--workspace",
    "-w",
    "--registry",
    "--tag",
    "--loglevel",
    "--cache",
    "--userconfig",
    "--globalconfig",
    "--reporter",
    "--depth",
    "--save-prefix",
    "--install-strategy",
    "--omit",
    "--include",
    "--before"
]);

/** Arguman listesindeki gercek paket belirtimlerini dondurur. */
export function specArgsOf(args: readonly string[]): string[] {
    const specs: string[] = [];
    let skipNext = false;

    for (const arg of args) {
        if (skipNext) {
            skipNext = false;
            continue;
        }

        if (arg.startsWith("-")) {
            // `--prefix=deger` bicimi de var.
            const [name] = arg.split("=", 1);

            if (!arg.includes("=") && VALUE_OPTIONS.has(name as string)) {
                skipNext = true;
            }

            continue;
        }

        specs.push(arg);
    }

    return specs;
}

/**
 * Ic ice npm cagrilari icin temiz ortam.
 *
 * npm, `npm run <script>` ile calistirilan her surece kendi config'ini
 * `npm_config_*` / `NPM_CONFIG_*` ortam degiskenleri olarak **export eder**.
 * Dissora bir npm script'i icinden cagrildiginda (orn. `npm run kur`) bu
 * degiskenler alt npm'e miras kalir ve kurulumlar bozulur:
 *
 * ```
 * npm error code EALLOWSCRIPTS
 * npm error --allow-scripts is not allowed in project-scoped installs.
 * ```
 *
 * Cikis, normal bir kabukta calistirilmis gibi olsun diye bu degiskenler
 * temizlenir; npm ayarlari yine kendi dosyalarindan okur.
 */
export function sanitizedNpmEnv(
    base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};

    for (const [key, value] of Object.entries(base)) {
        if (/^npm_config_/i.test(key)) {
            continue;
        }

        env[key] = value;
    }

    return env;
}

export async function npm(
    args: readonly string[],
    cwd: string,
    timeout = 300_000
): Promise<NpmResult> {
    for (const spec of specArgsOf(args)) {
        assertSafeSpec(spec);
    }

    const invocation = buildInvocation(args);

    try {
        const result = await run(invocation.file, invocation.args, {
            cwd,
            timeout,
            encoding: "utf8",
            windowsHide: true,
            maxBuffer: 16 * 1024 * 1024,
            env: sanitizedNpmEnv()
        });

        return {
            stdout: String(result.stdout ?? ""),
            stderr: String(result.stderr ?? "")
        };
    } catch (error) {
        const failure = error as {
            message?: string;
            stderr?: string;
            stdout?: string;
            code?: number | string | null;
            killed?: boolean;
            signal?: string | null;
        };

        throw new NpmError(
            describeFailure(failure),
            failure.stderr ?? "",
            typeof failure.code === "number" ? failure.code : null
        );
    }
}

export interface PackageInfo {
    readonly name: string;
    readonly version: string;
    readonly description: string | null;
    readonly homepage: string | null;
}

/**
 * `npm view` ciktisi tek paket icin obje, birden fazla eslesme icin dizi
 * olabilir; her iki durumu da normalize eder.
 */
export async function viewPackage(
    spec: string,
    cwd: string
): Promise<PackageInfo> {
    // `npm view` yerel tarball yolunu **cozmez** (her zaman registry'ye
    // gider ve 404 doner). Yerel paketlerde manifest dogrudan arsivden
    // okunur; boylece gercekte hangi surumun kurulacagini goruruz.
    const filePath = normalizeFileSpec(spec);

    if (filePath !== null) {
        return readTarballManifest(filePath, cwd);
    }

    const result = await npm(
        ["view", spec, "name", "version", "description", "homepage", "--json"],
        cwd,
        60_000
    );

    let parsed: unknown;

    try {
        parsed = JSON.parse(result.stdout.trim() === "" ? "{}" : result.stdout);
    } catch {
        throw new Error(`"${spec}" icin paket bilgisi okunamadi.`);
    }

    const record = Array.isArray(parsed) ? parsed[0] : parsed;

    if (
        record === undefined ||
        record === null ||
        typeof record !== "object" ||
        typeof (record as { name?: unknown }).name !== "string"
    ) {
        throw new Error(
            `"${spec}" bulunamadi. Paket adini ve registry erisimini kontrol et.`
        );
    }

    const data = record as {
        name: string;
        version?: string;
        description?: string | null;
        homepage?: string | null;
    };

    return {
        name: data.name,
        version: data.version ?? "0.0.0",
        description: data.description ?? null,
        homepage: data.homepage ?? null
    };
}

export async function installInto(
    spec: string,
    target: string,
    cwd: string
): Promise<void> {
    await npm(
        [
            "install",
            spec,
            "--prefix",
            target,
            "--no-save",
            "--ignore-scripts",
            "--omit=dev",
            "--no-audit",
            "--no-fund"
        ],
        cwd
    );
}

/** @scope/pkg -> scope-pkg */
export function sanitizePackageName(name: string): string {
    return name.replace(/^@/, "").replace(/[/\\]/g, "-");
}

const TAR_BLOCK = 512;

/** `package/package.json` gibi bir tar girdisinin icerigini dondurur. */
export function readTarEntry(archive: Buffer, wanted: string): Buffer | null {
    for (let offset = 0; offset + TAR_BLOCK <= archive.length; ) {
        const header = archive.subarray(offset, offset + TAR_BLOCK);

        // Iki sifir blogu: arsivin sonu.
        if (header.every(byte => byte === 0)) {
            return null;
        }

        const rawName = header.subarray(0, 100);
        const nameEnd = rawName.indexOf(0);
        const prefix = readString(header.subarray(345, 500));
        const name = readString(
            nameEnd === -1 ? rawName : rawName.subarray(0, nameEnd)
        );
        const sizeField = readString(header.subarray(124, 136)).trim();
        const size = Number.parseInt(sizeField, 8) || 0;
        const type = String.fromCharCode(header[156] ?? 0);

        offset += TAR_BLOCK;

        // `ust/alt dizin/.../ad` bicimi: onceki 155. bayta sigmayan adlar.
        const full = prefix ? `${prefix}/${name}` : name;

        if (full === wanted && (type === "0" || type === "\0")) {
            return archive.subarray(offset, offset + size) ?? null;
        }

        // Dosyalar 512 baytin katina yuvarlanmis boyut kadar yer kaplar.
        offset += Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
    }

    return null;
}

function readString(field: Buffer): string {
    const end = field.indexOf(0);

    return field
        .subarray(0, end === -1 ? field.length : end)
        .toString("utf8")
        .trim();
}

/**
 * Yerel `.tgz` / `.tar.gz` paketinin `package.json` bilgisini okur.
 *
 * npm `view` calisma zamanindaki **cozumlenecek** surumu verir ve `.tgz`
 * adreslerini hic desteklemez. Ayrica manifesti okumak icin gecici bir
 * `npm install` yapmak gereksiz: hem yavas hem de kurulusun
 * `allow-scripts` politikasina bagli kaliyor. Tarball gzip + tar oldugu
 * icin dogrudan okunuyor.
 */
export function readTarballManifest(
    filePath: string,
    cwd: string
): PackageInfo {
    const resolved = resolve(cwd, filePath);
    const compressed = readFileSync(resolved);

    // gzip imzasi: 0x1f 0x8b
    const isGzip =
        compressed.length > 2 &&
        compressed[0] === 0x1f &&
        compressed[1] === 0x8b;

    let archive: Buffer;

    try {
        archive = isGzip ? gunzipSync(compressed) : compressed;
    } catch {
        throw new Error(
            `"${filePath}" okunamadi: gecersiz gzip arsivi. ` +
                "Dosya bozuk ya da eksik olabilir."
        );
    }

    // npm her zaman `package/` kokunu kullanir.
    const entry =
        readTarEntry(archive, "package/package.json") ??
        readTarEntry(archive, "./package/package.json");

    if (entry === null) {
        throw new Error(
            `"${filePath}" icinde package/package.json bulunamadi. ` +
                "Dosya gecerli bir .tgz / .tar.gz paketi mi?"
        );
    }

    let raw: unknown;

    try {
        // Windows PowerShell 5.1'in `Out-File -Encoding UTF8` ve eski
        // araclar BOM ekler; npm bunu tolere ediyor, `JSON.parse` ise
        // reddediyor.
        const text = entry.toString("utf8").replace(/^﻿/, "").trim();

        raw = JSON.parse(text === "" ? "{}" : text);
    } catch {
        throw new Error(`"${filePath}" icindeki package.json gecersiz JSON.`);
    }

    if (
        raw === null ||
        typeof raw !== "object" ||
        typeof (raw as { name?: unknown }).name !== "string"
    ) {
        throw new Error(
            `"${filePath}" icindeki package.json gecersiz (name alani yok).`
        );
    }

    const data = raw as {
        name: string;
        version?: string;
        description?: string | null;
        homepage?: string | null;
    };

    return {
        name: data.name,
        version: data.version ?? "0.0.0",
        description: data.description ?? null,
        homepage: data.homepage ?? null
    };
}
