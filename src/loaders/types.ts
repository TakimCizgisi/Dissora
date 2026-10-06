import type { Client } from "discord.js";

import type { ResolvedConfig } from "../config/resolve.js";
import type { ModuleRuntime } from "../core/ModuleRuntime.js";
import type { Registry } from "../core/Registry.js";
import type { Logger } from "../services/Logger.js";
import type { ProjectPaths } from "../services/Paths.js";
import type { TimerRegistry } from "../services/TimerRegistry.js";
import type { ModuleContext } from "../types/context.js";

/**
 * Bir loader'in elinde olan her sey.
 *
 * Yeni bir yukleme tipi eklemek icin `Loader` arayuzunu uygulayip
 * `src/loaders/index.ts` icindeki `LOADERS` dizisine eklemek yeterli.
 */
export interface LoaderContext {
    readonly client: Client;
    readonly logger: Logger;
    readonly registry: Registry;
    readonly timers: TimerRegistry;
    readonly paths: ProjectPaths;
    readonly resolved: ResolvedConfig;
    readonly modulesDirName: string;
    /** Su an yuklenen modulun runtime kaydi (liste doldurulur). */
    readonly runtime: ModuleRuntime;
    /** Modul dosyalarina ve modul tarafindan kayit yapilanlara gecirilir. */
    readonly moduleContext: ModuleContext;
}

export interface Loader {
    /** Log ciktilarinda ve hata mesajlarinda kullanilir. */
    readonly name: string;
    load(context: LoaderContext): Promise<void>;
}

/**
 * Modul yukleme hatasini tek satira indirger.
 *
 * Node'un `MODULE_NOT_FOUND` hatalari cok satirlik "Require stack" blogu
 * icerir; gunlukte bu yigini gormek okunabilirligi bozar, bu yuzden yalnizca
 * ilk satir ve varsa hata kodu kullanilir.
 */
export function loaderErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
        return String(error);
    }

    const first = (error.message.split("\n")[0] ?? "").trim();
    const code = (error as NodeJS.ErrnoException).code;

    return code === undefined ? first : `${first} (${code})`;
}

export class LoaderError extends Error {
    readonly loader: string;

    readonly file: string | undefined;

    constructor(loader: string, message: string, file?: string) {
        super(message);
        this.name = "LoaderError";
        this.loader = loader;
        this.file = file;
    }
}
