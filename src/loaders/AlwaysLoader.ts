import type { ModuleContext } from "../types/context.js";
import { resolveScriptFile } from "../utils/fs.js";
import { loadModuleFile, unwrapDefault } from "../utils/load-module.js";
import { type Loader, type LoaderContext, LoaderError } from "./types.js";

/**
 * `Always/` altindaki periyodik gorevleri baslatir.
 *
 * Her gorev icin:
 *   - `main` export edilmis bir fonksiyon, ya da
 *   - `defineAlways(...)` sonucu (`{ execute, interval?, runOnStart?, name? }`)
 *
 * Oncelik sirasi: dosyada tanimli deger, yoksa `moduleconfig.json`.
 * Boylece periyot modulden **kodla** degistirilebilir; config yalnizca
 * varsayilan kalir.
 *
 * Zamanlayicilar `TimerRegistry` icinde tutulur; bot kapaninca hepsi
 * otomatik temizlenir.
 */
export class AlwaysLoader implements Loader {
    readonly name = "always";

    async load(context: LoaderContext): Promise<void> {
        const runtime = context.runtime;

        if (!runtime.config.always.enabled) {
            return;
        }

        for (const task of runtime.config.always.tasks) {
            try {
                this.startTask(
                    context,
                    task.file,
                    task.interval,
                    task.runOnStart
                );
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);

                context.logger.warn(
                    `gorev baslatilamadi: ${task.file} - ${message}`
                );
            }
        }
    }

    private startTask(
        context: LoaderContext,
        entry: string,
        configInterval: number,
        configRunOnStart: boolean
    ): void {
        const { runtime } = context;
        const target = resolveScriptFile(runtime.folder, entry);

        if (target === null) {
            throw new LoaderError(
                this.name,
                `dosya bulunamadi: ${entry}`,
                entry
            );
        }

        const loaded = unwrapDefault(loadModuleFile(target));
        const execute = this.readExecute(loaded, entry);
        const overrides = this.readOverrides(loaded);

        const interval = overrides.interval ?? configInterval;
        const runOnStart = overrides.runOnStart ?? configRunOnStart;

        if (!Number.isFinite(interval) || interval <= 0) {
            throw new LoaderError(
                this.name,
                `periyot gecersiz (${String(interval)}). ` +
                    "moduleconfig.json ya da defineAlways icinde pozitif sayi ver.",
                entry
            );
        }

        const label = `${runtime.name}/${overrides.name ?? entry}`;
        const moduleContext = context.moduleContext;

        if (runOnStart) {
            void context.timers.run(label, () => execute(moduleContext));
        }

        context.timers.every(label, interval, () => execute(moduleContext));
        runtime.tasks.push(label);
    }

    /**
     * `defineAlways` sonucundaki gecersiz alanlari yutar.
     *
     * Duz fonksiyon export edildiginde ({ `main` }) gecersiz alan yoktur.
     */
    private readOverrides(loaded: unknown): {
        readonly interval?: number;
        readonly runOnStart?: boolean;
        readonly name?: string;
    } {
        if (typeof loaded !== "object" || loaded === null) {
            return {};
        }

        const source = loaded as {
            interval?: unknown;
            runOnStart?: unknown;
            name?: unknown;
        };

        const interval =
            typeof source.interval === "number" &&
            Number.isFinite(source.interval) &&
            source.interval > 0
                ? source.interval
                : undefined;

        return {
            ...(interval === undefined ? {} : { interval }),
            ...(typeof source.runOnStart === "boolean"
                ? { runOnStart: source.runOnStart }
                : {}),
            ...(typeof source.name === "string" && source.name.trim() !== ""
                ? { name: source.name.trim() }
                : {})
        };
    }

    private readExecute(
        loaded: unknown,
        entry: string
    ): (context: ModuleContext) => unknown {
        if (typeof loaded === "function") {
            return loaded as (context: ModuleContext) => unknown;
        }

        if (loaded && typeof loaded === "object") {
            const execute = (loaded as { execute?: unknown }).execute;

            if (typeof execute === "function") {
                return execute as (context: ModuleContext) => unknown;
            }
        }

        throw new LoaderError(
            this.name,
            "gecersiz gorev dosyasi: fonksiyon ya da { execute } export edilmeli",
            entry
        );
    }
}
