import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigService } from "../src/config/resolve.js";

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dissora-resolve-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function writeEnvFile(contents: string): void {
    writeFileSync(join(root, ".env"), contents, "utf8");
}

function writeBotConfig(contents: Record<string, unknown>): void {
    mkdirSync(root, { recursive: true });
    writeFileSync(
        join(root, "BotConfig.json"),
        JSON.stringify(contents, null, 4),
        "utf8"
    );
}

describe("ConfigService katmanlari", () => {
    it("process.env degeri .env dosyasini ezer", () => {
        writeEnvFile("DISSORA_TOKEN=dosya-token\nDISSORA_LOG_LEVEL=debug\n");

        const resolved = new ConfigService(root, {
            env: {
                DISSORA_TOKEN: "ortam-token",
                DISSORA_LOG_LEVEL: "warn"
            }
        }).resolve();

        expect(resolved.token).toBe("ortam-token");
        expect(resolved.env.logLevel).toBe("warn");
    });

    it(".env bos degeri tanimli saymaz", () => {
        writeEnvFile("DISSORA_TOKEN=\nDISSORA_LOG_LEVEL=trace\n");

        const resolved = new ConfigService(root, { env: {} }).resolve();

        expect(resolved.token).toBeNull();
        expect(resolved.env.logLevel).toBe("trace");
    });

    it(".env degeri process.env yoksa kullanilir", () => {
        writeEnvFile("DISSORA_TOKEN=dosya-token\nDISSORA_BOT_NAME=DosyaBot\n");

        const resolved = new ConfigService(root, { env: {} }).resolve();

        expect(resolved.token).toBe("dosya-token");
        expect(resolved.bot.botName).toBe("DosyaBot");
    });

    it("BotConfig.json temel olur, env uzerine yazar", () => {
        writeBotConfig({ botName: "DosyaBot", logging: { level: "info" } });
        writeEnvFile("DISSORA_LOG_LEVEL=error\n");

        const resolved = new ConfigService(root, { env: {} }).resolve();

        expect(resolved.bot.botName).toBe("DosyaBot");
        expect(resolved.bot.logging.level).toBe("error");
    });

    it("calisma zamani override en son uygulanir", () => {
        writeBotConfig({ botName: "DosyaBot" });
        writeEnvFile("DISSORA_BOT_NAME=EnvBot\n");

        const resolved = new ConfigService(root, {
            env: {},
            overrides: { botName: "Override" }
        }).resolve();

        expect(resolved.bot.botName).toBe("Override");
        expect(resolved.sources.runtime).toBe("(aktif)");
    });

    it("skipDotenv .env dosyasini hic okumaz", () => {
        writeEnvFile("DISSORA_TOKEN=dosya-token\n");

        const service = new ConfigService(root, {
            env: { DISSORA_TOKEN: "ortam-token" },
            skipDotenv: true
        });

        expect(service.hasEnvFile()).toBe(false);
        expect(service.resolve().token).toBe("ortam-token");
    });

    it("DISCORD_TOKEN yedegi calisir", () => {
        const resolved = new ConfigService(root, {
            env: { DISCORD_TOKEN: "yedek" }
        }).resolve();

        expect(resolved.token).toBe("yedek");
    });
});
