import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configCommand } from "../src/cli/config.js";

let root: string;
let written: string[];

function readJson(path: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function writeBotConfig(value: Record<string, unknown>): void {
    writeFileSync(
        join(root, "BotConfig.json"),
        `${JSON.stringify(value, null, 2)}\n`,
        "utf8"
    );
}

function readEnvFile(): string {
    return existsSync(join(root, ".env"))
        ? readFileSync(join(root, ".env"), "utf8")
        : "";
}

function run(argv: string[]): number {
    written = [];

    const stdout = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: unknown) => {
            written.push(String(chunk));

            return true;
        });
    const stderr = vi
        .spyOn(process.stderr, "write")
        .mockImplementation((chunk: unknown) => {
            written.push(String(chunk));

            return true;
        });

    try {
        return configCommand(root, argv);
    } finally {
        stdout.mockRestore();
        stderr.mockRestore();
    }
}

function output(): string {
    return written.join("");
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dissora-config-cmd-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("config set - yalnizca istenen alan yazilir", () => {
    it("varsayilan alanlari dosyaya eklemez", () => {
        writeBotConfig({ botName: "Mevcut" });

        expect(run(["set", "logging.level", "debug"])).toBe(0);

        const written$ = readJson(join(root, "BotConfig.json"));

        expect(Object.keys(written$).sort()).toEqual(["botName", "logging"]);
        expect(written$.botName).toBe("Mevcut");
        expect(written$.logging).toEqual({ level: "debug" });
    });

    it("bilinmeyen alanlari korur", () => {
        writeBotConfig({ botName: "X", ozelAlan: { derin: 1 } });

        expect(run(["set", "logging.level", "warn"])).toBe(0);

        const result = readJson(join(root, "BotConfig.json")) as Record<
            string,
            unknown
        >;

        expect(result.ozelAlan).toEqual({ derin: 1 });
    });

    it("dosya yoksa yalnizca set edilen alani yazar", () => {
        expect(run(["set", "botName", "Test"])).toBe(0);

        const result = readJson(join(root, "BotConfig.json"));

        expect(result).toEqual({ botName: "Test" });
    });

    it("virgullu listeyi dizi olarak yazar", () => {
        expect(run(["set", "intents", "GuildMembers, MessageContent"])).toBe(0);

        expect(readJson(join(root, "BotConfig.json")).intents).toEqual([
            "GuildMembers",
            "MessageContent"
        ]);
    });
});

describe("config set - dogrulama", () => {
    it("gecersiz boolean'i reddeder ve dosyaya yazmaz", () => {
        writeBotConfig({ botName: "X" });

        expect(run(["set", "logging.timestamps", "evet"])).toBe(1);

        expect(output()).toMatch(/boolean deger gecersiz/);
        expect(readJson(join(root, "BotConfig.json"))).toEqual({
            botName: "X"
        });
    });

    it("boolean'i kabul eder", () => {
        expect(run(["set", "logging.timestamps", "off"])).toBe(0);

        expect(
            (
                readJson(join(root, "BotConfig.json")).logging as Record<
                    string,
                    unknown
                >
            ).timestamps
        ).toBe(false);
    });

    it("gecersiz log seviyesini reddeder", () => {
        expect(run(["set", "logging.level", "cok-kisa"])).toBe(1);

        expect(output()).toMatch(/gecersiz log seviyesi/);
    });

    it("gecersiz intent'i reddeder ve dosyaya yazmaz", () => {
        writeBotConfig({ botName: "X" });

        expect(run(["set", "intents", "GuildMembers,UydurmaIntent"])).toBe(1);

        expect(readJson(join(root, "BotConfig.json"))).toEqual({
            botName: "X"
        });
    });

    it("bilinmeyen anahtari reddeder", () => {
        expect(run(["set", "olmayanAlan", "x"])).toBe(1);

        expect(output()).toMatch(/bilinmeyen anahtar/);
    });

    it("eksik degerde kullanim yazar", () => {
        expect(run(["set", "logging.level"])).toBe(1);

        expect(output()).toMatch(/kullanim/);
    });
});

describe("config set - .env yazimi", () => {
    it("token'i maskeleyerek onaylar", () => {
        expect(run(["set", "token", "gizli-deger-1234"])).toBe(0);

        expect(readEnvFile()).toContain("DISSORA_TOKEN=gizli-deger-1234");
        expect(output()).not.toContain("gizli-deger-1234");
    });

    it("var olan anahtarin degerini gunceller", () => {
        writeFileSync(
            join(root, ".env"),
            "# yorum\nDISSORA_TOKEN=eski\nDISSORA_MODULES_DIR=Mods\n",
            "utf8"
        );

        expect(run(["set", "token", "yeni"])).toBe(0);

        const content = readEnvFile();

        expect(content).toContain("DISSORA_TOKEN=yeni");
        expect(content).not.toContain("eski");
        expect(content).toContain("# yorum");
        expect(content).toContain("DISSORA_MODULES_DIR=Mods");
    });

    it("CRLF satir sonunu korur", () => {
        writeFileSync(join(root, ".env"), "A=1\r\nB=2\r\n", "utf8");

        expect(run(["set", "token", "yeni"])).toBe(0);

        const content = readEnvFile();

        expect(content).toContain("\r\n");
        expect(content.endsWith("\r\n")).toBe(true);
    });

    it("dosya yoksa olusturur", () => {
        expect(run(["set", "modulesDir", "Mods"])).toBe(0);

        expect(readEnvFile()).toBe(
            "DISSORA_MODULES_DIR=Mods\r\n".replace("\r\n", "\n")
        );
    });
});

describe("config get - cozulmus degeri gosterir", () => {
    it("BotConfig.json degerini okur", () => {
        writeBotConfig({ logging: { level: "debug" } });

        expect(run(["get", "logging.level"])).toBe(0);
        expect(output()).toContain("debug");
    });

    it(".env ustun gelir", () => {
        writeBotConfig({ logging: { level: "debug" } });
        writeFileSync(join(root, ".env"), "DISSORA_LOG_LEVEL=warn\n", "utf8");

        expect(run(["get", "logging.level"])).toBe(0);

        // Ham dosya degeri degil, gercekten kullanilan deger.
        expect(output()).toContain("warn");
    });

    it("token'i maskeler", () => {
        writeFileSync(
            join(root, ".env"),
            "DISSORA_TOKEN=abcdefghijklmnopqrstuvwxyz012345\n",
            "utf8"
        );

        expect(run(["get", "token"])).toBe(0);

        expect(output()).not.toContain("abcdefghijklmnopqrstuvwxyz");
        expect(output()).toMatch(/\*\*\*\*/);
    });

    it("tanimsiz anahtarda exit 1 verir", () => {
        expect(run(["get", "token"])).toBe(1);
        expect(output()).toMatch(/tanimsiz/);
    });

    it("anahtarsiz kullanim yazar", () => {
        expect(run(["get"])).toBe(1);
        expect(output()).toMatch(/kullanim/);
    });
});

describe("config show - sifre sizmaz", () => {
    it("token'i duz metin basmaz", () => {
        writeFileSync(
            join(root, ".env"),
            "DISSORA_TOKEN=abcdefghijklmnopqrstuvwxyz012345\n",
            "utf8"
        );

        expect(run(["show"])).toBe(0);

        expect(output()).not.toContain("abcdefghijklmnopqrstuvwxyz");
        expect(output()).toMatch(/\*\*\*\*/);
    });
});

describe("config validate", () => {
    it("eksik dosyalari bildirip exit 1 verir", () => {
        expect(run(["validate"])).toBe(1);
        expect(output()).toMatch(/BotConfig.json bulunamadi/);
    });
});
