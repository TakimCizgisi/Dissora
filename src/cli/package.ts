/**
 * `dissora install` / `dissora update` / `dissora remove`
 *
 * Kurulum gecici bir klasorde yapilir, sonra atomik olarak yerine
 * konur; hata halinde eski surum geri yuklenir. Her kurulum/modul
 * klasorune `.dissora.json` kaydi yazilir.
 */

import { existsSync } from "node:fs";

import { ConfigService } from "../config/resolve.js";
import {
    installModule,
    readModuleRecord,
    removeModuleFolder,
    updateModule
} from "../services/Installer.js";
import { Logger } from "../services/Logger.js";
import { getStyler } from "../utils/colors.js";
import { listDirectories } from "../utils/fs.js";
import {
    flagBool,
    heading,
    keyValue,
    out,
    parseArgs,
    reportError
} from "./utils.js";

function context(projectPath: string): {
    projectPath: string;
    modulesDirName: string;
    logger: Logger;
} {
    const service = new ConfigService(projectPath);

    return {
        projectPath,
        modulesDirName: service.resolve().modulesDirName,
        logger: new Logger({ level: "info" })
    };
}

export async function installCommand(
    projectPath: string,
    argv: readonly string[]
): Promise<number> {
    const args = parseArgs(argv);
    const spec = args.positionals[0];

    if (spec === undefined) {
        out("kullanim: dissora install <paket|github:user/repo> [--force]");

        return 1;
    }

    const ctx = context(projectPath);

    try {
        const result = await installModule({
            spec,
            projectPath: ctx.projectPath,
            modulesDirName: ctx.modulesDirName,
            force: flagBool(args, "force"),
            logger: ctx.logger
        });

        const styler = getStyler();
        heading(result.created ? "Modul kuruldu" : "Modul guncellendi");
        keyValue("klasor", result.folder);
        keyValue("paket", result.package);
        keyValue("surum", result.version);
        keyValue("ad", result.config.name);
        keyValue("yol", `${ctx.modulesDirName}/${result.folder}`);
        out("");

        if (result.config.requires.length > 0) {
            out(
                `  ${styler.hex("#f59e0b", "!")} bagimliliklar: ${result.config.requires.join(", ")}`
            );
        }

        return 0;
    } catch (error) {
        reportError(error);

        return 1;
    }
}

export async function updateCommand(
    projectPath: string,
    argv: readonly string[]
): Promise<number> {
    const args = parseArgs(argv);
    const name = args.positionals[0];
    const spec = args.positionals[1];
    const ctx = context(projectPath);
    const styler = getStyler();

    try {
        if (name !== undefined) {
            const result = await updateModule({
                folder: name,
                projectPath: ctx.projectPath,
                modulesDirName: ctx.modulesDirName,
                ...(spec === undefined ? {} : { spec }),
                force: flagBool(args, "force"),
                logger: ctx.logger
            });

            heading("Modul guncellendi");
            keyValue("klasor", result.folder);
            keyValue("paket", result.package);
            keyValue("surum", result.version);
            out("");

            return 0;
        }

        const candidates = collectInstalled(ctx);

        if (candidates.length === 0) {
            out(
                `${styler.hex("#f59e0b", "-")} guncellenecek kurulu modul yok.`
            );

            return 0;
        }

        let failed = 0;

        for (const folder of candidates) {
            try {
                const result = await updateModule({
                    folder,
                    projectPath: ctx.projectPath,
                    modulesDirName: ctx.modulesDirName,
                    logger: ctx.logger
                });

                out(
                    `  ${styler.hex("#22c55e", "✓")} ${folder} ${styler.dim(
                        `-> ${result.version}`
                    )}`
                );
            } catch (error) {
                failed++;
                out(
                    `  ${styler.hex("#ef4444", "✖")} ${folder} ${styler.dim(
                        error instanceof Error ? error.message : String(error)
                    )}`
                );
            }
        }

        out("");

        return failed > 0 ? 1 : 0;
    } catch (error) {
        reportError(error);

        return 1;
    }
}

function collectInstalled(ctx: {
    projectPath: string;
    modulesDirName: string;
}): string[] {
    const service = new ConfigService(ctx.projectPath);
    const modulesDir = service.paths.modulesDirFor(ctx.modulesDirName);

    if (!existsSync(modulesDir)) {
        return [];
    }

    return listDirectories(modulesDir).filter(
        folder =>
            readModuleRecord(ctx.projectPath, folder, ctx.modulesDirName) !==
            null
    );
}

export function removeCommand(
    projectPath: string,
    argv: readonly string[]
): number {
    const args = parseArgs(argv);
    const name = args.positionals[0];
    const styler = getStyler();

    if (name === undefined) {
        out("kullanim: dissora remove <modul>");

        return 1;
    }

    const ctx = context(projectPath);

    try {
        const record = readModuleRecord(
            ctx.projectPath,
            name,
            ctx.modulesDirName
        );

        removeModuleFolder(ctx.projectPath, name, ctx.modulesDirName);

        heading("Modul kaldirildi");
        keyValue("klasor", name);
        keyValue(
            "paket",
            record?.package ?? styler.dim("(kayit yok, yerel modul)")
        );
        out("");

        return 0;
    } catch (error) {
        reportError(error);

        return 1;
    }
}
