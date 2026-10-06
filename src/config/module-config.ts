/**
 * moduleconfig.json semasi.
 *
 * Zorunlu alan: name. Geri kalan her alanin varsayilani vardir, boylece
 * en kucuk gecerli dosya su sekildedir:
 *
 *   { "name": "Economy" }
 */

import {
    asBoolean,
    asNumber,
    asOptionalString,
    asRequiredString,
    asString,
    asStringArray,
    type ConfigIssue,
    isPlainObject,
    issue,
    throwIfInvalid
} from "./errors.js";

/** Guvenli klasor / paket adi. Yol manipulasyonunu (path traversal) engeller. */
export const SAFE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function isSafeName(value: string): boolean {
    return SAFE_NAME_PATTERN.test(value);
}

export interface ModuleCommandEntry {
    readonly file: string;
    readonly name: string | null;
}

export interface ModuleEventEntry {
    readonly file: string;
    readonly event: string | null;
    readonly once: boolean;
}

export interface ModuleAlwaysEntry {
    readonly file: string;
    readonly interval: number;
    readonly runOnStart: boolean;
}

export interface ModuleCommandsConfig {
    readonly enabled: boolean;
    /** null => Command/ klasoru otomatik taranir. */
    readonly files: readonly ModuleCommandEntry[] | null;
}

export interface ModuleEventsConfig {
    readonly enabled: boolean;
    readonly files: readonly ModuleEventEntry[];
}

export interface ModuleAlwaysConfig {
    readonly enabled: boolean;
    readonly tasks: readonly ModuleAlwaysEntry[];
}

export interface ModuleConfig {
    readonly name: string;
    readonly version: string;
    readonly description: string | null;
    readonly author: string | null;
    readonly license: string | null;
    readonly homepage: string | null;
    readonly main: string;
    readonly enabled: boolean;
    readonly requires: readonly string[];
    readonly commands: ModuleCommandsConfig;
    readonly events: ModuleEventsConfig;
    readonly always: ModuleAlwaysConfig;
}

export const DEFAULT_MAIN = "index.js";

export const MIN_INTERVAL = 1000;

function parseEntryFile(
    raw: unknown,
    path: string,
    issues: ConfigIssue[]
): string | null {
    if (typeof raw === "string" && raw.trim() !== "") {
        return raw.trim();
    }

    if (isPlainObject(raw)) {
        const file = asRequiredString(raw.file, `${path}.file`, issues);

        return file;
    }

    issues.push(issue(path, "string ya da { file } olmali"));

    return null;
}

function parseCommandEntries(
    raw: unknown,
    path: string,
    issues: ConfigIssue[]
): ModuleCommandEntry[] | null {
    if (raw === undefined || raw === null) {
        return null;
    }

    if (!Array.isArray(raw)) {
        issues.push(issue(path, "dizi olmali"));

        return null;
    }

    const entries: ModuleCommandEntry[] = [];

    for (let index = 0; index < raw.length; index++) {
        const item = raw[index];
        const itemPath = `${path}[${index}]`;
        const file = parseEntryFile(item, itemPath, issues);

        if (file === null) {
            continue;
        }

        entries.push({
            file,
            name: isPlainObject(item)
                ? (asOptionalString(item.name, `${itemPath}.name`, issues) ??
                  null)
                : null
        });
    }

    return entries;
}

function parseEventEntries(
    raw: unknown,
    path: string,
    issues: ConfigIssue[]
): ModuleEventEntry[] {
    if (raw === undefined || raw === null) {
        return [];
    }

    if (!Array.isArray(raw)) {
        issues.push(issue(path, "dizi olmali"));

        return [];
    }

    const entries: ModuleEventEntry[] = [];

    for (let index = 0; index < raw.length; index++) {
        const item = raw[index];
        const itemPath = `${path}[${index}]`;
        const file = parseEntryFile(item, itemPath, issues);

        if (file === null) {
            continue;
        }

        // `{ file, event }` girisinde event zorunludur; string giriste event
        // adini dosyanin kendi `event` export'u belirler (bkz. EventLoader).
        const event = isPlainObject(item)
            ? (asOptionalString(item.event, `${itemPath}.event`, issues) ??
              null)
            : null;

        if (event === null && isPlainObject(item)) {
            issues.push(
                issue(
                    itemPath,
                    'event adi gerekli, orn. { "event": "ready", "file": "Event/ready.js" }'
                )
            );
            continue;
        }

        entries.push({
            file,
            event,
            once: asBoolean(
                isPlainObject(item) ? item.once : undefined,
                `${itemPath}.once`,
                issues,
                false
            )
        });
    }

    return entries;
}

function parseAlwaysEntries(
    raw: unknown,
    path: string,
    issues: ConfigIssue[]
): ModuleAlwaysEntry[] {
    if (raw === undefined || raw === null) {
        return [];
    }

    if (!Array.isArray(raw)) {
        issues.push(issue(path, "dizi olmali"));

        return [];
    }

    const entries: ModuleAlwaysEntry[] = [];

    for (let index = 0; index < raw.length; index++) {
        const item = raw[index];
        const itemPath = `${path}[${index}]`;
        const file = parseEntryFile(item, itemPath, issues);

        if (file === null) {
            continue;
        }

        const interval = asNumber(
            isPlainObject(item) ? item.interval : undefined,
            `${itemPath}.interval`,
            issues,
            0
        );

        if (!Number.isFinite(interval) || interval < MIN_INTERVAL) {
            issues.push(
                issue(
                    `${itemPath}.interval`,
                    `gecerli bir milisaniye degeri gerekli (en az ${MIN_INTERVAL})`
                )
            );
            continue;
        }

        entries.push({
            file,
            interval,
            runOnStart: asBoolean(
                isPlainObject(item) ? item.runOnStart : undefined,
                `${itemPath}.runOnStart`,
                issues,
                false
            )
        });
    }

    return entries;
}

export function parseModuleConfig(
    raw: unknown,
    source = "moduleconfig.json"
): ModuleConfig {
    if (!isPlainObject(raw)) {
        throwIfInvalid(source, [
            issue("(dosya)", 'obje olmali, orn. { "name": "Economy" }')
        ]);

        return undefined as unknown as ModuleConfig;
    }

    const issues: ConfigIssue[] = [];

    const name = asRequiredString(raw.name, "name", issues);

    if (name !== null && !isSafeName(name)) {
        issues.push(
            issue(
                "name",
                '"name" sadece harf, rakam, nokta, _ ve - icerebilir ve harf/rakam ile baslamalidir'
            )
        );
    }

    const requires = asStringArray(raw.requires, "requires", issues);

    for (let index = 0; index < requires.length; index++) {
        const dependency = requires[index] ?? "";

        if (dependency === name) {
            issues.push(
                issue(`requires[${index}]`, "modul kendine bagli olamaz")
            );
        }
    }

    const commandsRaw = raw.commands;
    const eventsRaw = raw.events;
    const alwaysRaw = raw.always;

    const commandsEnabled =
        commandsRaw === undefined || commandsRaw === null
            ? true
            : asBoolean(
                  isPlainObject(commandsRaw) ? commandsRaw.enabled : undefined,
                  "commands.enabled",
                  issues,
                  true
              );

    const eventsEnabled =
        eventsRaw === undefined || eventsRaw === null
            ? false
            : asBoolean(
                  isPlainObject(eventsRaw) ? eventsRaw.enabled : undefined,
                  "events.enabled",
                  issues,
                  false
              );

    const alwaysEnabled =
        alwaysRaw === undefined || alwaysRaw === null
            ? false
            : asBoolean(
                  isPlainObject(alwaysRaw) ? alwaysRaw.enabled : undefined,
                  "always.enabled",
                  issues,
                  false
              );

    const config: ModuleConfig = {
        name: name ?? "",
        version: asString(raw.version, "version", issues) ?? "0.0.0",
        description:
            asOptionalString(raw.description, "description", issues) ?? null,
        author: asOptionalString(raw.author, "author", issues) ?? null,
        license: asOptionalString(raw.license, "license", issues) ?? null,
        homepage: asOptionalString(raw.homepage, "homepage", issues) ?? null,
        main: asString(raw.main, "main", issues) ?? DEFAULT_MAIN,
        enabled: asBoolean(raw.enabled, "enabled", issues, true),
        requires,
        commands: {
            enabled: commandsEnabled,
            files: commandsEnabled
                ? parseCommandEntries(
                      isPlainObject(commandsRaw)
                          ? commandsRaw.files
                          : undefined,
                      "commands.files",
                      issues
                  )
                : null
        },
        events: {
            enabled: eventsEnabled,
            files: eventsEnabled
                ? parseEventEntries(
                      isPlainObject(eventsRaw) ? eventsRaw.files : undefined,
                      "events.files",
                      issues
                  )
                : []
        },
        always: {
            enabled: alwaysEnabled,
            tasks: alwaysEnabled
                ? parseAlwaysEntries(
                      isPlainObject(alwaysRaw) ? alwaysRaw.tasks : undefined,
                      "always.tasks",
                      issues
                  )
                : []
        }
    };

    throwIfInvalid(source, issues);

    return config;
}
