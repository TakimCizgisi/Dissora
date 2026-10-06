import { resolve } from "node:path";

import type { ChatInputCommandBody, CommandModule } from "../types/context.js";
import { isScriptFile, listFiles, resolveScriptFile } from "../utils/fs.js";
import { loadModuleFile, unwrapDefault } from "../utils/load-module.js";
import {
    type Loader,
    type LoaderContext,
    LoaderError,
    loaderErrorMessage
} from "./types.js";

/** Discord slash komutu ad kurallari. */
export const COMMAND_NAME_PATTERN = /^[-_\p{L}\p{N}]{1,32}$/u;

/**
 * Komut adini Discord'un kabul ettigi bicime indirger.
 *
 * Discord komut adlarini kucuk harf disinda kabul etmez (`/PING` hata verir).
 * Onceki kod yalnizca Registry anahtarini kuculttugu icin veri `data.name`
 * degismiyor ve kayit Discord'a gonderilirken reddediliyordu.
 */
export function normalizeCommandName(name: string): string {
    return name.trim().toLowerCase();
}

export function isValidCommandName(name: string): boolean {
    return COMMAND_NAME_PATTERN.test(name);
}

/**
 * Komut dosyalarini yukler.
 *
 * Oncelik: `commands.files` listesi. Liste yoksa `Command/` klasoru
 * otomatik taranir.
 *
 * Kayit anahtari `data.name` olur (veya `name`); boylece Discord'daki
 * komut adi ile calisma anindaki ad her zaman ayni kalir.
 */
export class CommandLoader implements Loader {
    readonly name = "command";

    async load(context: LoaderContext): Promise<void> {
        const runtime = context.runtime;

        if (!runtime.config.commands.enabled) {
            return;
        }

        const entries = this.collectEntries(context);

        for (const entry of entries) {
            try {
                this.loadFile(context, entry.file, entry.name);
            } catch (error) {
                context.logger.warn(
                    `komut yuklenemedi: ${entry.file} - ${loaderErrorMessage(error)}`
                );
            }
        }
    }

    private collectEntries(
        context: LoaderContext
    ): { file: string; name: string | null }[] {
        const runtime = context.runtime;
        const { commands } = runtime.config;

        if (commands.files !== null) {
            return commands.files.map(entry => ({
                file: entry.file,
                name: entry.name
            }));
        }

        const dir = resolve(runtime.folder, "Command");

        return listFiles(dir)
            .filter(file => isScriptFile(file))
            .map(file => ({ file: `Command/${file}`, name: null }));
    }

    private loadFile(
        context: LoaderContext,
        entry: string,
        declaredName: string | null
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

        const loaded: unknown = unwrapDefault(loadModuleFile(target));
        const command = loaded as CommandModule | undefined;

        if (
            command === null ||
            typeof command !== "object" ||
            typeof command.execute !== "function"
        ) {
            throw new LoaderError(
                this.name,
                "gecersiz komut: { execute } zorunlu",
                entry
            );
        }

        const data = normalizeCommandData(command, entry);
        const name = data.name;

        if (!isValidCommandName(name)) {
            throw new LoaderError(
                this.name,
                `gecersiz komut adi: "${name}" (1-32 karakter, kucuk harf/rakam/-/_)`,
                entry
            );
        }

        // Karsilastirmalar normalizasyon sonrasi yapilir: `declaredName: "PING"`
        // ile `data.name: "ping"` ayni komuttur, hata uretmemelidir.
        if (
            declaredName !== null &&
            normalizeCommandName(declaredName) !== name
        ) {
            throw new LoaderError(
                this.name,
                `config'deki ad (${declaredName}) ile data.name (${name}) uyusmuyor`,
                entry
            );
        }

        if (
            typeof command.name === "string" &&
            normalizeCommandName(command.name) !== name
        ) {
            throw new LoaderError(
                this.name,
                `name (${command.name}) ile data.name (${name}) uyusmuyor`,
                entry
            );
        }

        context.registry.addCommand({
            name,
            data,
            execute: command.execute,
            module: runtime.name,
            source: entry
        });

        runtime.commands.push(name);
    }
}

export function normalizeCommandData(
    command: CommandModule,
    source?: string
): ChatInputCommandBody {
    const raw: unknown = command.data;

    if (raw === undefined || raw === null) {
        if (typeof command.name !== "string") {
            throw new LoaderError("command", "data ya da name gerekli", source);
        }

        return {
            name: normalizeCommandName(command.name),
            description: command.description ?? "Dissora komutu"
        };
    }

    const value =
        typeof (raw as { toJSON?: unknown }).toJSON === "function"
            ? (raw as { toJSON(): unknown }).toJSON()
            : raw;

    if (typeof value !== "object" || value === null) {
        throw new LoaderError("command", "data gecersiz", source);
    }

    const record = value as { name?: unknown; description?: unknown };

    if (typeof record.name !== "string" || record.name.trim() === "") {
        throw new LoaderError("command", "data.name gerekli", source);
    }

    return {
        ...(record as Record<string, unknown>),
        name: normalizeCommandName(record.name),
        description:
            typeof record.description === "string" && record.description !== ""
                ? record.description
                : "Dissora komutu"
    } as ChatInputCommandBody;
}
