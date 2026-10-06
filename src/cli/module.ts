/**
 * `dissora module` - modul yonetimi.
 *
 *   dissora module list              kurulu moduller ve durumlari
 *   dissora module create <ad> [--ts] yeni modul sablonu
 *   dissora module enable <ad>        enabled: true
 *   dissora module disable <ad>      enabled: false
 *   dissora module info <ad>          tek modulun ayrintisi
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ConfigService } from "../config/resolve.js";
import { resolveModulePlan } from "../core/DependencyResolver.js";
import { collectModuleCandidates } from "../core/ModuleHost.js";
import { getStyler } from "../utils/colors.js";
import { readJsonFile, setTopLevelValue } from "../utils/fs.js";
import { createModule } from "./create-module.js";
import {
    flagBool,
    flagList,
    heading,
    keyValue,
    out,
    type ParsedArgs,
    parseArgs,
    reportError,
    requireSafeName
} from "./utils.js";

function modulesDirOf(projectPath: string): string {
    return new ConfigService(projectPath).resolve().modulesDir;
}

function listCommand(projectPath: string): number {
    const service = new ConfigService(projectPath);
    const resolved = service.resolve();
    const plan = resolveModulePlan(
        collectModuleCandidates(
            service.paths,
            resolved.modulesDir,
            resolved.modulesDirName
        )
    );
    const styler = getStyler();

    heading(
        `Moduller (${plan.order.length + plan.skipped.length + plan.errors.length})`
    );

    if (plan.order.length + plan.skipped.length + plan.errors.length === 0) {
        out(`  ${styler.dim("modul yok")}`);

        return 0;
    }

    for (const entry of plan.order) {
        out(
            `  ${styler.hex("#22c55e", "✓")} ${entry.name} ${styler.dim(
                `v${entry.config.version}`
            )} ${styler.dim("acik")}`
        );
    }

    for (const entry of plan.skipped) {
        out(
            `  ${styler.hex("#f59e0b", "-")} ${entry.name} ${styler.dim(
                entry.reason
            )}`
        );
    }

    for (const entry of plan.errors) {
        out(
            `  ${styler.hex("#ef4444", "✖")} ${entry.name} ${styler.dim(
                entry.reason
            )}`
        );
    }

    out("");

    return 0;
}

function toggleCommand(
    projectPath: string,
    name: string,
    enabled: boolean
): number {
    const service = new ConfigService(projectPath);
    const file = service.paths.moduleConfig(
        name,
        service.resolve().modulesDirName
    );
    const styler = getStyler();

    requireSafeName(name, "modul adi");

    if (!existsSync(file)) {
        out(`${styler.hex("#ef4444", "✖")} modul bulunamadi: ${name}`);

        return 1;
    }

    // Dosyadaki yorumlari korumak icin ham metnin ust seviye "enabled"
    // degeri degistirilir; `JSON.parse` yalnizca gecerlilik kontrolu
    // olarak kullanilir. Onceki `JSON.stringify` yaklasimi yorumlari
    // siliyordu.
    let raw: unknown;

    try {
        raw = readJsonFile(file);
    } catch {
        out(
            `${styler.hex("#ef4444", "✖")} moduleconfig.json gecersiz JSON: ${file}`
        );

        return 1;
    }

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        out(
            `${styler.hex("#ef4444", "✖")} moduleconfig.json nesne degil: ${file}`
        );

        return 1;
    }

    const updated = setTopLevelValue(
        readFileSync(file, "utf8"),
        "enabled",
        enabled ? "true" : "false"
    ).replace(/\s*$/, "\n");

    writeFileSync(file, updated, "utf8");

    out(
        `${styler.hex("#22c55e", "✓")} ${name} ${
            enabled ? "etkinlestirildi" : "devre disi birakildi"
        }`
    );

    return 0;
}

function infoOneCommand(projectPath: string, name: string): number {
    const service = new ConfigService(projectPath);
    const resolved = service.resolve();
    const file = service.paths.moduleConfig(name, resolved.modulesDirName);
    const styler = getStyler();

    requireSafeName(name, "modul adi");

    if (!existsSync(file)) {
        out(`${styler.hex("#ef4444", "✖")} modul bulunamadi: ${name}`);

        return 1;
    }

    const raw: unknown = readJsonFile(file);
    const config =
        raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

    heading(`Modul: ${name}`);
    keyValue("dosya", file);
    keyValue("name", String(config.name ?? "-"));
    keyValue("version", String(config.version ?? "-"));
    keyValue("description", String(config.description ?? "-"));
    keyValue("main", String(config.main ?? "-"));
    keyValue("enabled", String(config.enabled ?? true));
    keyValue(
        "requires",
        Array.isArray(config.requires) && config.requires.length > 0
            ? config.requires.join(", ")
            : "-"
    );
    keyValue(
        "commands.enabled",
        String(
            (config.commands as { enabled?: unknown } | undefined)?.enabled ??
                true
        )
    );
    keyValue(
        "events.enabled",
        String(
            (config.events as { enabled?: unknown } | undefined)?.enabled ??
                false
        )
    );
    keyValue(
        "always.enabled",
        String(
            (config.always as { enabled?: unknown } | undefined)?.enabled ??
                false
        )
    );
    out("");

    return 0;
}

export async function moduleCommand(
    projectPath: string,
    argv: readonly string[]
): Promise<number> {
    const args: ParsedArgs = parseArgs(argv);
    const sub = args.positionals[0] ?? "list";
    const name = args.positionals[1];

    try {
        switch (sub) {
            case "list":
            case "ls":
                return listCommand(projectPath);

            case "create":
            case "new": {
                if (name === undefined) {
                    out(
                        "kullanim: dissora module create <ad> [--ts|--js] [--requires A,B]"
                    );

                    return 1;
                }

                await createModule({
                    modulesDir: modulesDirOf(projectPath),
                    name,
                    typescript: flagBool(args, "ts")
                        ? true
                        : flagBool(args, "js")
                          ? false
                          : null,
                    requires: flagList(args, "requires")
                });

                return 0;
            }

            case "enable":
                if (name === undefined) {
                    out("kullanim: dissora module enable <ad>");

                    return 1;
                }

                return toggleCommand(projectPath, name, true);

            case "disable":
                if (name === undefined) {
                    out("kullanim: dissora module disable <ad>");

                    return 1;
                }

                return toggleCommand(projectPath, name, false);

            case "info":
                if (name === undefined) {
                    out("kullanim: dissora module info <ad>");

                    return 1;
                }

                return infoOneCommand(projectPath, name);

            default:
                out(`bilinmeyen alt komut: ${sub}`);
                out("alt komutlar: list, create, enable, disable, info");

                return 1;
        }
    } catch (error) {
        reportError(error);

        return 1;
    }
}

/** `dissora module` icin kullanilan modul klasorunun goreli yolu. */
export function moduleDirLabel(projectPath: string): string {
    return resolve(projectPath, "Modules");
}
