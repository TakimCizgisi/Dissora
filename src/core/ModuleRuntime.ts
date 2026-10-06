import type { ModuleConfig } from "../config/module-config.js";

/** Bir modulun bot omru boyunca ki durumu. */
export type ModuleState = "loaded" | "disabled" | "skipped" | "failed";

export interface ModuleRuntime {
    /** Klasor adi (benzersiz anahtar). */
    readonly name: string;
    /** moduleconfig.json icindeki `name` degeri. */
    declaredName: string;
    readonly folder: string;
    readonly version: string;
    state: ModuleState;
    /** `disabled` / `skipped` / `failed` icin insan-okunur neden. */
    reason: string | null;
    error: Error | null;
    readonly config: ModuleConfig;
    /** Yuklenen komut adlari. */
    commands: string[];
    /** Baglanan event adlari. */
    events: string[];
    /** Baslatilan zamanlayici etiketleri. */
    tasks: string[];
    readonly requires: readonly string[];
}

export interface ModuleRuntimeInput {
    readonly name: string;
    readonly declaredName: string;
    readonly folder: string;
    readonly version: string;
    readonly state?: ModuleState;
    readonly reason?: string | null;
    readonly error?: Error | null;
    readonly config: ModuleConfig;
    readonly requires?: readonly string[];
}

export function createModuleRuntime(input: ModuleRuntimeInput): ModuleRuntime {
    return {
        name: input.name,
        declaredName: input.declaredName,
        folder: input.folder,
        version: input.version,
        state: input.state ?? "loaded",
        reason: input.reason ?? null,
        error: input.error ?? null,
        config: input.config,
        commands: [],
        events: [],
        tasks: [],
        requires: input.requires ?? input.config.requires
    };
}
