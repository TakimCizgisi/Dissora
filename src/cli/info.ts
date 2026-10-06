/**
 * `dissora info` - proje ve yapilandirma ozeti.
 *
 * Baglanmadan calisir: modul config'lerini okur, bagimlilik sirasini
 * cikarir ve hatalari raporlar. Sorun gidarmak icin ilk bakilacak komut.
 *
 * Cikis kodu: 0 = sorun yok, 1 = eksik/hatali bir sey var.
 */

import { existsSync } from "node:fs";

import { ConfigService } from "../config/resolve.js";
import { resolveModulePlan } from "../core/DependencyResolver.js";
import { collectModuleCandidates } from "../core/ModuleHost.js";
import { getStyler } from "../utils/colors.js";
import { VERSION } from "../version.js";
import { heading, keyValue, out, reportError } from "./utils.js";

export function infoCommand(projectPath: string): number {
    const service = new ConfigService(projectPath);
    const paths = service.paths;
    const resolved = service.resolve();
    const styler = getStyler();
    let problems = 0;

    heading("Dissora");
    keyValue("surum", VERSION);
    keyValue("proje", paths.root);
    keyValue("node", process.version);

    heading("Yapilandirma");
    keyValue(
        "BotConfig.json",
        paths.hasBotConfig()
            ? styler.hex("#22c55e", "var")
            : styler.hex("#f59e0b", "yok")
    );
    keyValue(
        ".env",
        existsSync(paths.envFile)
            ? styler.hex("#22c55e", "var")
            : styler.hex("#f59e0b", "yok")
    );
    keyValue(
        "token",
        resolved.token === null
            ? styler.hex("#ef4444", "yok")
            : styler.hex("#22c55e", "var")
    );
    keyValue("modul klasoru", paths.relative(resolved.modulesDir));
    keyValue("komut kapsami", resolved.bot.commands.scope);
    keyValue("gunluk seviyesi", resolved.bot.logging.level);
    keyValue("intents", resolved.bot.intents.join(", "));

    if (resolved.token === null) {
        problems++;
    }

    const candidates = collectModuleCandidates(
        paths,
        resolved.modulesDir,
        resolved.modulesDirName
    );
    const plan = resolveModulePlan(candidates);

    heading(`Moduller (${candidates.length})`);

    if (candidates.length === 0) {
        out(`  ${styler.dim("modul yok - dissora create <ad> ile basla")}`);
    }

    for (const entry of plan.order) {
        const requires =
            entry.config.requires.length > 0
                ? styler.dim(` <- ${entry.config.requires.join(", ")}`)
                : "";

        out(
            `  ${styler.hex("#22c55e", "✓")} ${entry.name} ${styler.dim(
                `v${entry.config.version}`
            )}${requires}`
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
        problems++;
        out(
            `  ${styler.hex("#ef4444", "✖")} ${entry.name} ${styler.dim(
                entry.reason
            )}`
        );
    }

    out("");

    return problems > 0 ? 1 : 0;
}

/** `dissora info` giris noktasi: hatalari yakalar, exit code doner. */
export function runInfo(projectPath: string): number {
    try {
        return infoCommand(projectPath);
    } catch (error) {
        reportError(error);

        return 1;
    }
}
