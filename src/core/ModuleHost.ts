import { existsSync } from "node:fs";

import type { Client } from "discord.js";

import {
    type ModuleConfig,
    parseModuleConfig
} from "../config/module-config.js";
import type { ResolvedConfig } from "../config/resolve.js";
import { normalizeCommandData } from "../loaders/CommandLoader.js";
import { LOADERS } from "../loaders/index.js";
import type { LoaderContext } from "../loaders/types.js";
import type { Logger } from "../services/Logger.js";
import type { ProjectPaths } from "../services/Paths.js";
import type { TimerRegistry } from "../services/TimerRegistry.js";
import type {
    CommandModule,
    Disposer,
    EventModule,
    ModuleContext,
    ModuleExports
} from "../types/context.js";
import { traceHandlerResult } from "../utils/async.js";
import {
    listDirectories,
    readJsonFile,
    resolveScriptFile
} from "../utils/fs.js";
import { loadModuleFile, unwrapDefault } from "../utils/load-module.js";
import type { DissoraBot } from "./Bot.js";
import type { ModuleCandidate } from "./DependencyResolver.js";
import type { DissoraClient } from "./DissoraClient.js";
import { createModuleRuntime, type ModuleRuntime } from "./ModuleRuntime.js";
import type { BindingEmitter, Registry } from "./Registry.js";

export interface ModuleHostDeps {
    readonly bot: DissoraBot;
    readonly dissora: DissoraClient;
    readonly client: Client;
    readonly logger: Logger;
    readonly registry: Registry;
    readonly timers: TimerRegistry;
    readonly paths: ProjectPaths;
    readonly resolved: ResolvedConfig;
    readonly modulesDirName: string;
    readonly exports: Map<string, unknown>;
}

export interface ModuleCandidateResult {
    readonly name: string;
    readonly config: ModuleConfig | null;
    readonly error: Error | null;
}

/**
 * Bir klasorun `moduleconfig.json` dosyasini okur.
 *
 * Hata durumunda istisna firlatmaz; aday `error` dolu doner. Boylece
 * bozuk bir modul digerlerini engellemez.
 */
export function readModuleCandidate(
    paths: ProjectPaths,
    folderName: string,
    modulesDirName: string
): ModuleCandidateResult {
    let configFile: string;

    try {
        configFile = paths.moduleConfig(folderName, modulesDirName);
    } catch (error) {
        return {
            name: folderName,
            config: null,
            error: error instanceof Error ? error : new Error(String(error))
        };
    }

    if (!existsSync(configFile)) {
        return {
            name: folderName,
            config: null,
            error: new Error("moduleconfig.json bulunamadi")
        };
    }

    try {
        return {
            name: folderName,
            config: parseModuleConfig(readJsonFile(configFile), configFile),
            error: null
        };
    } catch (error) {
        return {
            name: folderName,
            config: null,
            error: error instanceof Error ? error : new Error(String(error))
        };
    }
}

/**
 * `Modules/` altindaki tum klasorler icin aday listesi uretir.
 *
 * `dissora info` gibi modul kodu calistirmayan komutlar da bunu kullanir.
 */
export function collectModuleCandidates(
    paths: ProjectPaths,
    modulesDir: string,
    modulesDirName: string
): ModuleCandidate[] {
    if (!existsSync(modulesDir)) {
        return [];
    }

    return listDirectories(modulesDir).map(folder =>
        readModuleCandidate(paths, folder, modulesDirName)
    );
}

/**
 * Tek bir modulu yukler.
 *
 * Hata izolasyonu burada saglanir: config okuma hatasi, eksik main dosyasi,
 * `init`/`start` hatasi veya loader hatalari modulu `failed` isaretleyip
 * botu **durmaz**.
 */
export class ModuleHost {
    private readonly deps: ModuleHostDeps;

    constructor(deps: ModuleHostDeps) {
        this.deps = deps;
    }

    /** Config dosyasini okur; hata halinde `error` dolu aday doner. */
    readCandidate(folderName: string): ModuleCandidateResult {
        return readModuleCandidate(
            this.deps.paths,
            folderName,
            this.deps.modulesDirName
        );
    }

    async load(name: string, config: ModuleConfig): Promise<ModuleRuntime> {
        const { paths, client, logger, registry, timers, resolved } = this.deps;
        const folder = paths.module(name, this.deps.modulesDirName);
        const moduleLogger = logger.child(name);

        const runtime = createModuleRuntime({
            name,
            declaredName: config.name,
            folder,
            version: config.version,
            config
        });

        const context = this.createContext(runtime, moduleLogger);
        const snapshot = registry.snapshot();
        const timerSnapshot = timers.mark();

        try {
            const mainPath = resolveScriptFile(folder, config.main);

            if (mainPath === null) {
                throw new Error(`main dosyasi bulunamadi: ${config.main}`);
            }

            const main = unwrapDefault(loadModuleFile(mainPath)) as
                | ModuleExports
                | undefined;

            this.deps.exports.set(name, main);

            if (typeof main?.init === "function") {
                await main.init(context);
            }

            const loaderContext: LoaderContext = {
                client,
                logger: moduleLogger,
                registry,
                timers,
                paths,
                resolved,
                modulesDirName: this.deps.modulesDirName,
                runtime,
                moduleContext: context
            };

            for (const loader of LOADERS) {
                try {
                    await loader.load(loaderContext);
                } catch (error) {
                    moduleLogger.warn(
                        `${loader.name} loader hatasi: ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`
                    );
                }
            }

            if (typeof main?.start === "function") {
                await main.start(context);
            }

            moduleLogger.info(
                `yuklendi: ${runtime.commands.length} komut, ${runtime.events.length} event, ${runtime.tasks.length} gorev`
            );
        } catch (error) {
            runtime.state = "failed";
            runtime.reason =
                error instanceof Error ? error.message : String(error);
            runtime.error =
                error instanceof Error ? error : new Error(String(error));

            // Yarim yuklenmis modul iz birakmasin: komutlar silinir, event
            // dinleyicileri sokulur, kayitlar eski duruma doner.
            registry.rollback(snapshot);
            timers.rollback(timerSnapshot);
            runtime.commands.length = 0;
            runtime.events.length = 0;
            runtime.tasks.length = 0;
            this.deps.exports.delete(name);

            moduleLogger.error(`yuklenemedi: ${runtime.reason}`);
        }

        return runtime;
    }

    private createContext(
        runtime: ModuleRuntime,
        moduleLogger: Logger
    ): ModuleContext {
        const { registry, timers, paths, client, resolved, bot, dissora } =
            this.deps;

        const context: ModuleContext = {
            client,
            bot,
            module: runtime.name,
            folder: runtime.folder,
            config: runtime.config,
            env: process.env,
            log: moduleLogger,
            dissora,
            paths,
            timers,
            registry,
            resolved,
            registerCommand: (command: CommandModule) => {
                const data = normalizeCommandData(command);

                registry.addCommand({
                    name: data.name,
                    data,
                    execute: command.execute,
                    module: runtime.name,
                    source: null
                });

                runtime.commands.push(data.name);
            },
            registerEvent: (event: EventModule) => {
                this.bindEvent(context, event, runtime);
            },
            onDispose: (disposer: Disposer) => {
                registry.addDisposer(disposer);
            }
        };

        return context;
    }

    private bindEvent(
        context: ModuleContext,
        event: EventModule,
        runtime: ModuleRuntime
    ): void {
        const { registry } = this.deps;
        const emitter = context.client as unknown as {
            on(event: string, listener: (...args: never[]) => unknown): unknown;
            once(
                event: string,
                listener: (...args: never[]) => unknown
            ): unknown;
        };

        const handler = (...args: never[]): unknown => {
            // Programatik kayit: senkron throw, reddedilmis promise ve
            // thenable degerler yakalanmali, yoksa surec cokerek kapanir.
            traceHandlerResult(
                () => event.execute(...args),
                error => {
                    context.log.error(
                        `event hatasi: ${event.event}`,
                        error instanceof Error ? error.message : error
                    );
                }
            );

            return undefined;
        };

        if (event.once === true) {
            emitter.once(event.event, handler);
        } else {
            emitter.on(event.event, handler);
        }

        registry.trackBinding({
            emitter: context.client as unknown as BindingEmitter,
            event: event.event,
            handler
        });

        registry.addEvent({
            event: event.event,
            module: runtime.name,
            source: null,
            once: event.once === true,
            handler
        });

        runtime.events.push(
            event.once === true ? `${event.event} (once)` : event.event
        );
    }
}
