import {
    cpSync,
    existsSync,
    mkdirSync,
    renameSync,
    rmSync,
    writeFileSync
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

import {
    isSafeName,
    type ModuleConfig,
    parseModuleConfig
} from "../config/module-config.js";
import { readJsonFile } from "../utils/fs.js";
import type { Logger } from "./Logger.js";
import {
    installInto,
    type PackageInfo,
    sanitizePackageName,
    viewPackage
} from "./PackageService.js";
import { ProjectPaths } from "./Paths.js";

/** `dissora install` sonrasi modul klasorune yazilan kayit. */
export interface ModuleRecord {
    readonly package: string;
    readonly version: string;
    readonly installedAt: string;
    readonly source: string;
}

const BACKUP_SUFFIX = ".dissora-backup";

export interface InstallOptions {
    readonly spec: string;
    readonly projectPath: string;
    readonly modulesDirName?: string;
    /** Kurulumda zorla klasor adi (update icin). */
    readonly folder?: string;
    /** Var olan yerel modulun uzerine yazmayi izin verir. */
    readonly force?: boolean;
    readonly logger?: Logger;
}

export interface InstallResult {
    readonly folder: string;
    readonly package: string;
    readonly version: string;
    readonly config: ModuleConfig;
    readonly created: boolean;
    readonly updated: boolean;
}

export function modulesDirNameOf(options: {
    readonly modulesDirName?: string;
}): string {
    return options.modulesDirName ?? "Modules";
}

/**
 * Modul klasorunu guvenli sekilde degistirir.
 *
 * 1. yeni surum gecici klasore kurulur
 * 2. mevcut klasor `.dissora-backup` olarak tasinir
 * 3. yeni surum kopyalanir
 * 4. `afterCopy` calistirilir (kurulum kaydi gibi dosyalar burada yazilir)
 * 5. hata olursa eski surum **tam olarak** geri yuklenir
 *
 * `afterCopy` de bu yazinin icinde tutulur: kayit yazilirken hata olursa
 * (disk dolu, izin yok) modul eski surumde geri doner; yoksa yeni kod +
 * eski kayit durumu birbirine karisir.
 *
 * Boylece `dissora update` yarida kesilse bile modul kaybolmaz.
 */
export function replaceModuleFolder(
    source: string,
    target: string,
    afterCopy?: () => void
): void {
    const parent = resolve(target, "..");
    const backup = `${target}${BACKUP_SUFFIX}`;
    const hadExisting = existsSync(target);

    mkdirSync(parent, { recursive: true });

    if (hadExisting) {
        rmSync(backup, { recursive: true, force: true });
        renameSync(target, backup);
    }

    try {
        cpSync(source, target, {
            recursive: true,
            filter: entry => {
                const name = basename(entry);

                return name !== ".git" && name !== BACKUP_SUFFIX;
            }
        });

        afterCopy?.();

        if (hadExisting) {
            rmSync(backup, { recursive: true, force: true });
        }
    } catch (error) {
        // Hedefi temizle: yarim kalan yeni surum eskisinin yerine gecmesin.
        rmSync(target, { recursive: true, force: true });

        if (hadExisting && existsSync(backup)) {
            renameSync(backup, target);
        }

        throw error;
    }
}

/**
 * Var olan klasorun uzerine yazilip yazilmayacagini kontrol eder.
 *
 * Kaydi olmayan bir klasor kullaniciya ait **yerel** bir moduldur
 * (`dissora module create` ile uretilmis olabilir). Sessizce ezmek
 * kullanici kodunu yok eder.
 */
function assertOverwritable(
    projectPath: string,
    folder: string,
    modulesDirName: string,
    force: boolean | undefined,
    packageName: string
): boolean {
    const paths = new ProjectPaths(projectPath);
    const target = paths.module(folder, modulesDirName);

    if (!existsSync(target)) {
        return false;
    }

    if (force === true) {
        return true;
    }

    const existing = readModuleRecord(projectPath, folder, modulesDirName);

    if (existing !== null && existing.package === packageName) {
        return true;
    }

    if (existing !== null) {
        throw new Error(
            `${folder} klasoru zaten "${existing.package}" paketinden kurulmus. ` +
                `Yeniden kurmak icin: dissora remove ${folder} (veya --force)`
        );
    }

    throw new Error(
        `${folder} klasorunde kurulum kaydi yok; bu yerel bir modul olabilir. ` +
            `Ezmemek icin --force kullanin: dissora install ${packageName} --force`
    );
}

export async function installModule(
    options: InstallOptions
): Promise<InstallResult> {
    const paths = new ProjectPaths(options.projectPath);
    const modulesDirName = modulesDirNameOf(options);
    const modulesDir = paths.modulesDirFor(modulesDirName);

    mkdirSync(modulesDir, { recursive: true });

    const info: PackageInfo = await viewPackage(
        options.spec,
        options.projectPath
    );
    const temp = await mkdtemp(resolve(tmpdir(), "dissora-"));

    try {
        await installInto(options.spec, temp, options.projectPath);

        const parts = info.name.split("/");
        const source = resolve(
            temp,
            "node_modules",
            ...(parts.length > 1 ? parts : [parts[0] ?? info.name])
        );

        if (!existsSync(source)) {
            throw new Error("Paket klasoru bulunamadi.");
        }

        const configPath = resolve(source, "moduleconfig.json");

        if (!existsSync(configPath)) {
            throw new Error(
                `Bu paket Dissora modulu degil: ${info.name} icinde moduleconfig.json yok.`
            );
        }

        const config = parseModuleConfig(
            readJsonFile(configPath),
            `${info.name}/moduleconfig.json`
        );

        const folder = pickFolder({
            forced: options.folder,
            declared: config.name,
            packageName: info.name
        });

        const target = paths.module(folder, modulesDirName);
        const updated = assertOverwritable(
            options.projectPath,
            folder,
            modulesDirName,
            options.force,
            info.name
        );

        const record: ModuleRecord = {
            package: info.name,
            version: info.version,
            installedAt: new Date().toISOString(),
            source: options.spec
        };

        // Kayit yazimi klasor degistirme islemimin **icinde**: yazma
        // basarisiz olursa modul eski surume geri doner.
        replaceModuleFolder(source, target, () => {
            writeFileSync(
                paths.moduleRecord(folder, modulesDirName),
                `${JSON.stringify(record, null, 4)}\n`,
                "utf8"
            );
        });

        return {
            folder,
            package: info.name,
            version: info.version,
            config,
            created: !updated,
            updated
        };
    } finally {
        rmSync(temp, { recursive: true, force: true });
    }
}

function pickFolder(input: {
    forced: string | undefined;
    declared: string;
    packageName: string;
}): string {
    const candidates = [
        input.forced,
        input.declared,
        sanitizePackageName(input.packageName)
    ];

    for (const candidate of candidates) {
        if (
            candidate !== undefined &&
            candidate !== "" &&
            isSafeName(candidate)
        ) {
            return candidate;
        }
    }

    throw new Error(
        `Guvenli bir modul klasor adi uretilemedi (paket: ${input.packageName}).`
    );
}

export function readModuleRecord(
    projectPath: string,
    folder: string,
    modulesDirName = "Modules"
): ModuleRecord | null {
    const paths = new ProjectPaths(projectPath);
    const file = paths.moduleRecord(folder, modulesDirName);

    if (!existsSync(file)) {
        return null;
    }

    try {
        const raw = readJsonFile(file) as Partial<ModuleRecord>;

        if (typeof raw.package !== "string") {
            return null;
        }

        return {
            package: raw.package,
            version: raw.version ?? "0.0.0",
            installedAt: raw.installedAt ?? "",
            source: raw.source ?? raw.package
        };
    } catch {
        return null;
    }
}

/**
 * Kurulmus modulu yeniden kurar. Once silmez: kaynagi hazirlar, sonra
 * guvenli sekilde degistirir.
 */
export async function updateModule(options: {
    readonly folder: string;
    readonly projectPath: string;
    readonly modulesDirName?: string;
    readonly spec?: string;
    readonly force?: boolean;
    readonly logger?: Logger;
}): Promise<InstallResult> {
    const modulesDirName = modulesDirNameOf(options);
    const record = readModuleRecord(
        options.projectPath,
        options.folder,
        modulesDirName
    );

    const spec = options.spec ?? record?.source ?? record?.package;

    if (spec === undefined) {
        throw new Error(
            `${options.folder}: kayit dosyasi yok (.dissora.json). Once "dissora install <paket>" calistir.`
        );
    }

    return installModule({
        spec,
        projectPath: options.projectPath,
        modulesDirName,
        folder: options.folder,
        // `update` ayni modulun yeni surumunu kurar; ayni paket kaydi
        // zaten eslesiyor, `--force` sadece paket degistirmeyi serbest birakir.
        force: options.force ?? true,
        logger: options.logger
    });
}

export function removeModuleFolder(
    projectPath: string,
    folder: string,
    modulesDirName = "Modules"
): void {
    const paths = new ProjectPaths(projectPath);
    const target = paths.module(folder, modulesDirName);

    if (!existsSync(target)) {
        throw new Error(`Modul bulunamadi: ${folder}`);
    }

    rmSync(target, { recursive: true, force: true });
}

export function readModuleConfigFile(
    projectPath: string,
    folder: string,
    modulesDirName = "Modules"
): { config: ModuleConfig; file: string } {
    const paths = new ProjectPaths(projectPath);
    const file = paths.moduleConfig(folder, modulesDirName);

    if (!existsSync(file)) {
        throw new Error(`moduleconfig.json bulunamadi: ${folder}`);
    }

    return {
        file,
        config: parseModuleConfig(readJsonFile(file), file)
    };
}

export function setModuleEnabled(
    projectPath: string,
    folder: string,
    enabled: boolean,
    modulesDirName = "Modules"
): void {
    const paths = new ProjectPaths(projectPath);
    const file = paths.moduleConfig(folder, modulesDirName);

    if (!existsSync(file)) {
        throw new Error(`moduleconfig.json bulunamadi: ${folder}`);
    }

    const raw = readJsonFile(file);

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error(`${file} gecersiz JSON.`);
    }

    const updated = { ...(raw as Record<string, unknown>), enabled };

    writeFileSync(file, `${JSON.stringify(updated, null, 4)}\n`, "utf8");
}
