import { describe, expect, it } from "vitest";

import {
    DEFAULT_BOT_CONFIG,
    KNOWN_INTENTS,
    parseBotConfig
} from "../src/config/bot-config.js";
import { ENV_FIELDS, readEnv } from "../src/config/env.js";
import { ConfigError } from "../src/config/errors.js";
import {
    isSafeName,
    parseModuleConfig,
    SAFE_NAME_PATTERN
} from "../src/config/module-config.js";

describe("parseBotConfig", () => {
    it("bos girdide varsayilanlari doner", () => {
        expect(parseBotConfig(null)).toEqual(DEFAULT_BOT_CONFIG);
        expect(parseBotConfig(undefined)).toEqual(DEFAULT_BOT_CONFIG);
    });

    it("en kucuk dosyayi kabul eder", () => {
        const config = parseBotConfig({ name: "Bot" });

        expect(config.status).toBe("online");
        expect(config.commands.register).toBe(true);
        expect(config.intents).toEqual(DEFAULT_BOT_CONFIG.intents);
    });

    it("gecersiz status icin hata firlatir ve yolu bildirir", () => {
        expect(() =>
            parseBotConfig({ status: "yok" }, "BotConfig.json")
        ).toThrow(ConfigError);

        try {
            parseBotConfig({ status: "yok" }, "BotConfig.json");
        } catch (error) {
            expect(error).toBeInstanceOf(ConfigError);
            expect((error as ConfigError).source).toBe("BotConfig.json");
            expect((error as ConfigError).issues[0]?.path).toBe("status");
        }
    });

    it("bilinmeyen intent'i reddeder", () => {
        expect(() => parseBotConfig({ intents: ["Guilds", "Ucus"] })).toThrow(
            /Ufus|gecersiz intent/
        );
    });

    it("bilinen intent listesini kabul eder", () => {
        expect(
            parseBotConfig({ intents: ["Guilds", "MessageContent"] }).intents
        ).toEqual(["Guilds", "MessageContent"]);
    });

    it("status ve scope degerlerini kucuk harfe indirger", () => {
        const config = parseBotConfig({
            status: "DND",
            commands: { scope: "GUILD" }
        });

        expect(config.status).toBe("dnd");
        expect(config.commands.scope).toBe("guild");
    });

    it("tum bilinen intent'ler sozdizimsel olarak gecerli", () => {
        for (const intent of KNOWN_INTENTS) {
            expect(() => parseBotConfig({ intents: [intent] })).not.toThrow();
        }
    });

    it("aktivite metnini `text` alanindan da kabul eder", () => {
        expect(
            parseBotConfig({ activity: { text: "Oynuyor" } }).activity.name
        ).toBe("Oynuyor");
    });

    it("birden fazla hatayi tek exception'da toplar", () => {
        try {
            parseBotConfig(
                { status: "x", locale: 5, intents: ["Nope"] },
                "BotConfig.json"
            );
            throw new Error("beklenen hata firlatilmadi");
        } catch (error) {
            expect(error).toBeInstanceOf(ConfigError);
            expect((error as ConfigError).issues.length).toBeGreaterThanOrEqual(
                3
            );
        }
    });
});

describe("parseModuleConfig", () => {
    it("yalnizca name zorunludur", () => {
        const config = parseModuleConfig({ name: "Economy" });

        expect(config.name).toBe("Economy");
        expect(config.version).toBe("0.0.0");
        expect(config.main).toBe("index.js");
        expect(config.enabled).toBe(true);
        expect(config.requires).toEqual([]);
    });

    it("commands varsayilan olarak acik, digerleri kapali", () => {
        const config = parseModuleConfig({ name: "A" });

        expect(config.commands.enabled).toBe(true);
        expect(config.commands.files).toBeNull();
        expect(config.events.enabled).toBe(false);
        expect(config.always.enabled).toBe(false);
    });

    it("guvensiz ad reddedilir", () => {
        expect(() => parseModuleConfig({ name: "../kötü" })).toThrow(
            ConfigError
        );
        expect(() => parseModuleConfig({ name: "a/b" })).toThrow(/harf, rakam/);
    });

    it("kendine bagimlilik reddedilir", () => {
        expect(() => parseModuleConfig({ name: "A", requires: ["A"] })).toThrow(
            /kendine bagli olamaz/
        );
    });

    it("cok kisa interval reddedilir", () => {
        expect(() =>
            parseModuleConfig({
                name: "A",
                always: {
                    enabled: true,
                    tasks: [{ file: "x.js", interval: 10 }]
                }
            })
        ).toThrow(/en az 1000/);
    });

    it("event kaydi olmadan event dosyasi reddedilir", () => {
        expect(() =>
            parseModuleConfig({
                name: "A",
                events: { enabled: true, files: [{ file: "E/x.js" }] }
            })
        ).toThrow(/event adi gerekli/);
    });

    it("commands.files listesi otomatik taramayi kapatir", () => {
        const config = parseModuleConfig({
            name: "A",
            commands: {
                enabled: true,
                files: ["Command/a.js", { file: "b.js", name: "b" }]
            }
        });

        expect(config.commands.files).toEqual([
            { file: "Command/a.js", name: null },
            { file: "b.js", name: "b" }
        ]);
    });

    it("ana dosya uzantisi degistirilebilir", () => {
        expect(parseModuleConfig({ name: "A", main: "index.ts" }).main).toBe(
            "index.ts"
        );
    });
});

describe("isSafeName", () => {
    it("guvenli adlari kabul eder", () => {
        for (const name of ["A", "modul-1", "modul_1.0", "9lives"]) {
            expect(isSafeName(name)).toBe(true);
        }
    });

    it("yol manipulasyonunu ve nokta baslangicini reddeder", () => {
        for (const name of ["..", "../etc", "a/b", "a\\b", ".hidden", ""]) {
            expect(isSafeName(name)).toBe(false);
        }
    });

    it("sekil nokta dolu degildir", () => {
        expect(SAFE_NAME_PATTERN.test("A")).toBe(true);
        expect(SAFE_NAME_PATTERN.test(".A")).toBe(false);
        expect(SAFE_NAME_PATTERN.test("A.B")).toBe(true);
    });
});

describe("readEnv", () => {
    it("DISSORA_TOKEN ve DISCORD_TOKEN fallback'i", () => {
        expect(readEnv({ DISCORD_TOKEN: "abc" }).token).toBe("abc");
        expect(
            readEnv({ DISSORA_TOKEN: "xyz", DISCORD_TOKEN: "abc" }).token
        ).toBe("xyz");
    });

    it("tanimsiz alanlari null birakir (dosya degerini ezmez)", () => {
        const env = readEnv({});

        expect(env.logLevel).toBeNull();
        expect(env.logTimestamps).toBeNull();
        expect(env.commandScope).toBeNull();
        expect(env.pruneStale).toBeNull();
    });

    it("virgullu listeleri ayirir", () => {
        expect(
            readEnv({ DISSORA_INTENTS: "Guilds, GuildMessages" }).intents
        ).toEqual(["Guilds", "GuildMessages"]);
    });

    it("gecersiz enum degerini reddeder", () => {
        expect(() => readEnv({ DISSORA_LOG_LEVEL: "cok" })).toThrow(
            ConfigError
        );
    });

    it("modulesDir varsayilani Modules", () => {
        expect(readEnv({}).modulesDir).toBe("Modules");
        expect(readEnv({ DISSORA_MODULES_DIR: "Mods" }).modulesDir).toBe(
            "Mods"
        );
    });

    it("guildId bos string'i null sayar", () => {
        expect(readEnv({ DISSORA_GUILD_ID: "   " }).guildId).toBeNull();
    });

    // Regresyon: `guildId` bir surecde yalnizca `DISCORD_GUILD_ID`
    // okuyordu, ama `.env` sablonu, `config set` ve `ENV_FIELDS`
    // `DISSORA_GUILD_ID` uretiyordu -> kullanici degeri hic okunamiyordu.
    it("DISSORA_GUILD_ID okunur", () => {
        expect(readEnv({ DISSORA_GUILD_ID: "123" }).guildId).toBe("123");
    });

    it("DISSORA_GUILD_ID, DISCORD_GUILD_ID'i ezer", () => {
        expect(
            readEnv({
                DISSORA_GUILD_ID: "yeni",
                DISCORD_GUILD_ID: "eski"
            }).guildId
        ).toBe("yeni");
    });

    it("eski DISCORD_GUILD_ID hala desteklenir", () => {
        expect(readEnv({ DISCORD_GUILD_ID: "abc" }).guildId).toBe("abc");
    });

    it("ENV_FIELDS kanonik DISSORA_ on ekini kullanir", () => {
        for (const field of ENV_FIELDS) {
            expect(field.key.startsWith("DISSORA_")).toBe(true);
        }
    });
});
