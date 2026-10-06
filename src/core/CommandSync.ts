import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";

import type { Logger } from "../services/Logger.js";
import type { RegisteredCommand } from "./Registry.js";

/** discord.js komut yoneticisinin ihtiyac duydugu minimum yuzey. */
export interface RemoteCommand {
    readonly id: string;
    readonly name: string;
}

export interface CommandManagerLike {
    fetch(): Promise<Iterable<RemoteCommand>>;
    create(data: RESTPostAPIApplicationCommandsJSONBody): Promise<unknown>;
    edit(
        id: string,
        data: RESTPostAPIApplicationCommandsJSONBody
    ): Promise<unknown>;
    bulkDelete(ids: readonly string[]): Promise<unknown>;
}

export interface ApplicationLike {
    readonly application: { commands: CommandManagerLike };
    readonly guilds: {
        fetch(id: string): Promise<{ commands: CommandManagerLike }>;
    };
}

export type SyncScope = "guild" | "global";

export interface SyncOptions {
    readonly scope: SyncScope;
    readonly guildId: string | null;
    /** Discord'da kalmis ama artik istenmeyen komutlar silinsin mi? */
    readonly prune: boolean;
}

export interface SyncReport {
    readonly scope: SyncScope;
    readonly created: string[];
    readonly updated: string[];
    readonly pruned: string[];
}

async function resolveManager(
    application: ApplicationLike,
    options: SyncOptions
): Promise<CommandManagerLike> {
    if (options.scope === "guild") {
        if (options.guildId === null) {
            throw new Error(
                "Guild kapsami secildi ama DISCORD_GUILD_ID tanimli degil."
            );
        }

        const guild = await application.guilds.fetch(options.guildId);

        return guild.commands;
    }

    return application.application.commands;
}

/**
 * Komutlari Discord'a yazar.
 *
 * - Olmayan komutlar olusturulur, var olanlar guncellenir.
 * - `prune` acikken, artik istenmeyen komutlar Discord'dan silinir.
 * - Hata durumunda rapor yerine istisna firlatilir; cagiran taraf loglar.
 */
export async function syncCommands(
    application: ApplicationLike,
    commands: readonly RegisteredCommand[],
    options: SyncOptions,
    logger: Logger
): Promise<SyncReport> {
    const manager = await resolveManager(application, options);
    const existing = [...(await manager.fetch())];

    if (commands.length === 0) {
        // Butun komutlari kaynakli bir hata olabilir (moduller yuklenemedi,
        // tumu devre disi birakildi). Bu durumda Discord'daki kayitlara
        // dokunmak geri alinamaz bir veri kaybi yaratir.
        logger.warn(
            `yerel komut yok (${existing.length} komut Discord'da korunuyor). ` +
                "Prune calismadi; once modul yukleme hatalarini kontrol et."
        );

        return {
            scope: options.scope,
            created: [],
            updated: [],
            pruned: []
        };
    }

    const byName = new Map(existing.map(entry => [entry.name, entry]));

    const created: string[] = [];
    const updated: string[] = [];

    for (const command of commands) {
        const current = byName.get(command.name);

        if (current === undefined) {
            await manager.create(command.data);
            created.push(command.name);
            continue;
        }

        await manager.edit(current.id, command.data);
        updated.push(command.name);
    }

    const wanted = new Set(commands.map(command => command.name));
    const stale = existing.filter(entry => !wanted.has(entry.name));
    const pruned: string[] = [];

    if (stale.length === 0) {
        return { scope: options.scope, created, updated, pruned };
    }

    if (options.prune) {
        await manager.bulkDelete(stale.map(entry => entry.id));

        for (const entry of stale) {
            pruned.push(entry.name);
        }
    } else {
        logger.warn(
            `${stale.length} eski komut hala Discord'da: ${stale
                .map(entry => entry.name)
                .join(", ")} (pruneStale: false)`
        );
    }

    return { scope: options.scope, created, updated, pruned };
}
