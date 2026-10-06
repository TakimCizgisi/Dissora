import type { BindingEmitter } from "../core/Registry.js";
import type { EventModule } from "../types/context.js";
import { traceHandlerResult } from "../utils/async.js";
import { resolveScriptFile } from "../utils/fs.js";
import { loadModuleFile, unwrapDefault } from "../utils/load-module.js";
import {
    type Loader,
    type LoaderContext,
    LoaderError,
    loaderErrorMessage
} from "./types.js";

/**
 * Event dosyalarini yukler ve dinleyicileri takip altina alir.
 *
 * Event adini `moduleconfig.json` icindeki kayit ya da dosyanin kendi
 * `event` alani belirler. `once: true` tek seferlik dinleyici kullanilir.
 *
 * Olay adlari tek bir string havuzundan gelmedigi icin tip denetimi
 * zorunlu degildir; bu dosyalar config ile birlikte surdurulur.
 */
export class EventLoader implements Loader {
    readonly name = "event";

    async load(context: LoaderContext): Promise<void> {
        const runtime = context.runtime;

        if (!runtime.config.events.enabled) {
            return;
        }

        for (const entry of runtime.config.events.files) {
            try {
                this.loadFile(context, entry.file, entry.event, entry.once);
            } catch (error) {
                context.logger.warn(
                    `event yuklenemedi: ${entry.file} - ${loaderErrorMessage(error)}`
                );
            }
        }
    }

    private loadFile(
        context: LoaderContext,
        entry: string,
        configuredEvent: string | null,
        configuredOnce: boolean
    ): void {
        const { runtime, client } = context;
        const target = resolveScriptFile(runtime.folder, entry);

        if (target === null) {
            throw new LoaderError(
                this.name,
                `dosya bulunamadi: ${entry}`,
                entry
            );
        }

        const loaded: unknown = unwrapDefault(loadModuleFile(target));

        const eventName = configuredEvent ?? this.readEventName(loaded);
        const once = configuredOnce || this.readOnce(loaded);
        const execute = this.readExecute(loaded);

        if (eventName === null) {
            throw new LoaderError(
                this.name,
                'event adi yok. moduleconfig.json icinde { "event": "ready" } yazin ya da dosyada `event` alani bulunsun.',
                entry
            );
        }

        const handler = (...args: never[]): unknown => {
            // EventEmitter return degerini yutmaz; hem senkron throw hem de
            // reddedilmis promise (ve thenable) yakalanmali. Aksi halde
            // `unhandledRejection` framework guard'i ile sureci oldurur.
            traceHandlerResult(
                () => execute(...args),
                error => {
                    context.logger.error(
                        `event hatasi: ${eventName}`,
                        error instanceof Error ? error.message : error
                    );
                }
            );

            return undefined;
        };

        const emitter = client as unknown as {
            on(event: string, listener: (...args: never[]) => unknown): unknown;
            once(
                event: string,
                listener: (...args: never[]) => unknown
            ): unknown;
        };

        if (once) {
            emitter.once(eventName, handler);
        } else {
            emitter.on(eventName, handler);
        }

        context.registry.trackBinding({
            emitter: client as unknown as BindingEmitter,
            event: eventName,
            handler
        });

        context.registry.addEvent({
            event: eventName,
            module: runtime.name,
            source: entry,
            once,
            handler
        });

        runtime.events.push(once ? `${eventName} (once)` : eventName);
    }

    private readEventName(loaded: unknown): string | null {
        if (typeof loaded === "function") {
            return null;
        }

        if (loaded && typeof loaded === "object") {
            const event = (loaded as Partial<EventModule>).event;

            if (typeof event === "string" && event.trim() !== "") {
                return event.trim();
            }
        }

        return null;
    }

    private readOnce(loaded: unknown): boolean {
        if (loaded && typeof loaded === "object") {
            return (loaded as Partial<EventModule>).once === true;
        }

        return false;
    }

    private readExecute(loaded: unknown): (...args: never[]) => unknown {
        if (typeof loaded === "function") {
            return loaded as (...args: never[]) => unknown;
        }

        if (loaded && typeof loaded === "object") {
            const execute = (loaded as Partial<EventModule>).execute;

            if (typeof execute === "function") {
                return execute as (...args: never[]) => unknown;
            }
        }

        throw new LoaderError(
            this.name,
            "gecersiz event dosyasi: fonksiyon ya da { execute } export edilmeli"
        );
    }
}
