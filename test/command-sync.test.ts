import { describe, expect, it, vi } from "vitest";

import {
    type ApplicationLike,
    type CommandManagerLike,
    type RemoteCommand,
    syncCommands
} from "../src/core/CommandSync.js";
import type { RegisteredCommand } from "../src/core/Registry.js";
import { Logger } from "../src/services/Logger.js";

interface FakeState {
    commands: RemoteCommand[];
    created: string[];
    edited: string[];
    deleted: string[];
    failOnCreate: boolean;
}

function createManager(state: FakeState): CommandManagerLike {
    return {
        async fetch(): Promise<Iterable<RemoteCommand>> {
            return state.commands.map(entry => ({ ...entry }));
        },

        async create(data): Promise<unknown> {
            if (state.failOnCreate) {
                throw new Error("yetki yok");
            }

            state.created.push(data.name);
            state.commands.push({ id: `id-${data.name}`, name: data.name });

            return null;
        },

        async edit(id, data): Promise<unknown> {
            state.edited.push(`${id}:${data.name}`);

            return null;
        },

        async bulkDelete(ids): Promise<unknown> {
            state.deleted.push(...ids);
            state.commands = state.commands.filter(
                entry => !ids.includes(entry.id)
            );

            return null;
        }
    };
}

function createApplication(state: FakeState): ApplicationLike {
    const manager = createManager(state);

    return {
        application: { commands: manager },
        guilds: {
            fetch: async () => ({ commands: manager })
        }
    };
}

function command(name: string): RegisteredCommand {
    return {
        name,
        data: { name, description: `${name} aciklamasi` },
        execute: () => undefined,
        module: "Test",
        source: null
    };
}

function logger(): Logger {
    return new Logger({
        level: "silent",
        out: { write: (): boolean => true } as unknown as NodeJS.WritableStream,
        err: { write: (): boolean => true } as unknown as NodeJS.WritableStream
    });
}

function state(partial: Partial<FakeState> = {}): FakeState {
    return {
        commands: [],
        created: [],
        edited: [],
        deleted: [],
        failOnCreate: false,
        ...partial
    };
}

describe("syncCommands - olusturma ve guncelleme", () => {
    it("olmayan komutlari olusturur", async () => {
        const current = state();
        const report = await syncCommands(
            createApplication(current),
            [command("ping"), command("yardim")],
            { scope: "global", guildId: null, prune: true },
            logger()
        );

        expect(current.created).toEqual(["ping", "yardim"]);
        expect(report.created).toEqual(["ping", "yardim"]);
        expect(report.updated).toEqual([]);
    });

    it("var olan komutlari gunceller", async () => {
        const current = state({ commands: [{ id: "42", name: "ping" }] });
        const report = await syncCommands(
            createApplication(current),
            [command("ping")],
            { scope: "global", guildId: null, prune: true },
            logger()
        );

        expect(current.edited).toEqual(["42:ping"]);
        expect(current.created).toEqual([]);
        expect(report.updated).toEqual(["ping"]);
    });

    it("karisim durumunda ikisini de yapar", async () => {
        const current = state({ commands: [{ id: "1", name: "eski-ad" }] });
        const report = await syncCommands(
            createApplication(current),
            [command("yeni-ad")],
            { scope: "global", guildId: null, prune: true },
            logger()
        );

        expect(current.created).toEqual(["yeni-ad"]);
        expect(report.created).toEqual(["yeni-ad"]);
        expect(report.pruned).toEqual(["eski-ad"]);
    });
});

describe("syncCommands - stale komut temizligi", () => {
    it("prune acikken fazladan komutlari siler", async () => {
        const current = state({
            commands: [
                { id: "1", name: "istenen" },
                { id: "2", name: "istenmeyen" }
            ]
        });
        const report = await syncCommands(
            createApplication(current),
            [command("istenen")],
            { scope: "global", guildId: null, prune: true },
            logger()
        );

        expect(current.deleted).toEqual(["2"]);
        expect(report.pruned).toEqual(["istenmeyen"]);
        expect(current.commands.map(entry => entry.name)).toEqual(["istenen"]);
    });

    it("prune kapaliyken silmez", async () => {
        const current = state({
            commands: [
                { id: "1", name: "istenen" },
                { id: "2", name: "istenmeyen" }
            ]
        });
        const report = await syncCommands(
            createApplication(current),
            [command("istenen")],
            { scope: "global", guildId: null, prune: false },
            logger()
        );

        expect(current.deleted).toEqual([]);
        expect(report.pruned).toEqual([]);
    });

    it("tum komutlar kalindiginda delete cagrilmaz", async () => {
        const current = state({ commands: [{ id: "1", name: "istenen" }] });
        await syncCommands(
            createApplication(current),
            [command("istenen")],
            { scope: "global", guildId: null, prune: true },
            logger()
        );

        expect(current.deleted).toEqual([]);
    });

    it("hic komut yoksa temizlik yapmaz", async () => {
        const current = state();
        const report = await syncCommands(
            createApplication(current),
            [],
            { scope: "global", guildId: null, prune: true },
            logger()
        );

        expect(current.deleted).toEqual([]);
        expect(report).toEqual({
            scope: "global",
            created: [],
            updated: [],
            pruned: []
        });
    });

    it("yerel komut yoksa uzak komutlari ASLA silmez", async () => {
        const current = state();

        current.commands = [
            { id: "1", name: "eski" },
            { id: "2", name: "daha-eski" }
        ];

        const log = logger();
        const warn = vi.spyOn(log, "warn");

        const report = await syncCommands(
            createApplication(current),
            [],
            { scope: "global", guildId: null, prune: true },
            log
        );

        // Veri kaybi: hicbir komut yuklenmemisse tum komutlar silinmemeli.
        expect(current.deleted).toEqual([]);
        expect(current.commands).toHaveLength(2);
        expect(report.pruned).toEqual([]);
        expect(warn).toHaveBeenCalled();
    });
});

describe("syncCommands - guild kapsami", () => {
    it("guild komut yoneticisini kullanir", async () => {
        const current = state();
        const application = createApplication(current);

        await syncCommands(
            application,
            [command("ping")],
            { scope: "guild", guildId: "123", prune: true },
            logger()
        );

        expect(current.created).toEqual(["ping"]);
    });

    it("guild id yoksa anlasilir hata firlatir", async () => {
        await expect(
            syncCommands(
                createApplication(state()),
                [],
                {
                    scope: "guild",
                    guildId: null,
                    prune: true
                },
                logger()
            )
        ).rejects.toThrow(/DISCORD_GUILD_ID/);
    });
});

describe("syncCommands - hata yonetimi", () => {
    it("olusturma hatasini yukarilari firlatir", async () => {
        const current = state({ failOnCreate: true });

        await expect(
            syncCommands(
                createApplication(current),
                [command("ping")],
                { scope: "global", guildId: null, prune: true },
                logger()
            )
        ).rejects.toThrow(/yetki yok/);
    });

    it("bot yetkisi yoksa botu oldurmaz, cagriya birakilir", async () => {
        const fetch = vi.fn();

        await expect(
            syncCommands(
                {
                    application: {
                        commands: { fetch } as unknown as CommandManagerLike
                    },
                    guilds: {
                        fetch: async () => ({
                            commands: {} as CommandManagerLike
                        })
                    }
                },
                [],
                { scope: "global", guildId: null, prune: true },
                logger()
            )
        ).rejects.toThrow();
    });
});
