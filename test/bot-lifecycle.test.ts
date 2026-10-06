import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BotOptions, DissoraBot } from "../src/core/Bot.js";
import { Logger } from "../src/services/Logger.js";

let root: string;

function sink(): NodeJS.WritableStream {
    return {
        write(): boolean {
            return true;
        }
    } as unknown as NodeJS.WritableStream;
}

function silentLogger(): Logger {
    const stream = sink();

    return new Logger({ level: "silent", out: stream, err: stream });
}

/** discord.js `Client` benzeri sahte istemci. */
class FakeClient extends EventEmitter {
    ready = false;

    user: { tag: string } | null = null;

    commands = new Map();

    dissora: unknown = null;

    destroyed = false;

    loginCalls = 0;

    async login(token: string): Promise<string> {
        this.loginCalls++;

        if (token === "bad") {
            throw new Error("An invalid token was provided.");
        }

        return token;
    }

    /** Test icin `ready` olayini tetikler. */
    emitReady(): void {
        this.ready = true;
        this.user = { tag: "Bot#0001" };
        this.emit("ready", this.user);
    }

    async destroy(): Promise<void> {
        this.destroyed = true;
        this.removeAllListeners();
    }
}

function createBot(
    overrides: BotOptions["overrides"] = {},
    client: FakeClient = new FakeClient(),
    options: Partial<BotOptions> = {}
): DissoraBot {
    return new DissoraBot(root, {
        logger: silentLogger(),
        exitOnShutdown: false,
        env: { DISSORA_TOKEN: "token" },
        skipDotenv: true,
        clientFactory: () => client as never,
        registerCommands: false,
        overrides,
        ...options
    });
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dissora-bot-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("DissoraBot - start dogrulamasi", () => {
    it("token yoksa hicbir durum degismez", async () => {
        const bot = new DissoraBot(root, {
            logger: silentLogger(),
            exitOnShutdown: false,
            env: {},
            skipDotenv: true,
            clientFactory: () => new FakeClient() as never
        });

        await expect(bot.start()).rejects.toThrow(/Token bulunamadi/);

        // Durum `idle` kalmali: yoksa sonraki `start()` sessizce doner.
        expect(bot.state).toBe("idle");
    });

    it("gecersiz intent hatasinda durum takili kalmaz", async () => {
        const bot = createBot({ intents: ["GecersizIntent"] });

        await expect(bot.start()).rejects.toThrow(/Gecersiz intent/);

        // `loading`de takilirsa yeniden baslatma calismazdi.
        expect(bot.state).not.toBe("loading");
        expect(bot.state).toBe("stopped");
    });
});

describe("DissoraBot - login hatasi", () => {
    it("basarisiz login sonrasi temizlenir ve hata firlatir", async () => {
        const client = new FakeClient();
        const bot = createBot({}, client, { env: { DISSORA_TOKEN: "bad" } });

        await expect(bot.start()).rejects.toThrow(
            /An invalid token was provided/
        );

        expect(bot.state).toBe("stopped");
        expect(client.destroyed).toBe(true);
        expect(bot.client).toBeNull();
    });

    it("token hatasi anlasilir sekilde yuzeye cikar", async () => {
        const bot = new DissoraBot(root, {
            logger: silentLogger(),
            exitOnShutdown: false,
            env: {},
            skipDotenv: true,
            clientFactory: () => new FakeClient() as never
        });

        await expect(bot.start()).rejects.toThrow(/Token bulunamadi/);
    });
});

describe("DissoraBot - ready bekleme", () => {
    it("istemci hatasi ready beklemesini kirar", async () => {
        const client = new FakeClient();
        const bot = createBot({}, client);

        const started = bot.start();

        await Promise.resolve();

        client.emit("error", new Error("gateway kapali"));

        await expect(started).rejects.toThrow(/gateway kapali/);
        expect(bot.state).toBe("stopped");
    });

    it("ready geldikten sonra onReady hook hatasi botu dusurmez", async () => {
        const client = new FakeClient();

        const bot = new DissoraBot(root, {
            logger: silentLogger(),
            exitOnShutdown: false,
            env: { DISSORA_TOKEN: "token" },
            skipDotenv: true,
            clientFactory: () => client as never,
            registerCommands: false,
            hooks: {
                onReady: () => {
                    throw new Error("hook patladi");
                }
            }
        });

        const started = bot.start();

        await Promise.resolve();
        client.emitReady();

        await started;

        expect(bot.state).toBe("ready");
    });

    it("ready hook'unun rejected promise'i botu dusurmez", async () => {
        const client = new FakeClient();

        const bot = new DissoraBot(root, {
            logger: silentLogger(),
            exitOnShutdown: false,
            env: { DISSORA_TOKEN: "token" },
            skipDotenv: true,
            clientFactory: () => client as never,
            registerCommands: false,
            hooks: {
                onReady: async () => {
                    throw new Error("async hook patladi");
                }
            }
        });

        const started = bot.start();

        await Promise.resolve();
        client.emitReady();

        await started;
        await new Promise(resolve => setImmediate(resolve));

        expect(bot.state).toBe("ready");
    });
});

describe("DissoraBot - stop ve restart", () => {
    it("stop idempotenttir", async () => {
        const client = new FakeClient();
        const bot = createBot({}, client);

        const started = bot.start();

        await Promise.resolve();
        client.emitReady();
        await started;

        await bot.stop();
        await bot.stop();

        expect(bot.state).toBe("stopped");
        expect(client.destroyed).toBe(true);
    });

    it("restart durumu idle'a dondurur ve ikinci start calisir", async () => {
        const first = new FakeClient();
        const bot = createBot({}, first);

        const started = bot.start();

        await Promise.resolve();
        first.emitReady();
        await started;

        expect(bot.state).toBe("ready");

        await bot.restart();

        expect(bot.state).toBe("idle");
        expect(bot.client).toBeNull();
        expect(bot.registry.count).toBe(0);
        expect(bot.modules.size).toBe(0);

        // Ayni bot, ayni fabrika ile ikinci kez baslatilir: `dissora dev`
        // yeni bot nesnesi kurmadan yeniden baslatir.
        const next = bot.start();

        await Promise.resolve();
        first.emitReady();

        await next;

        expect(bot.state).toBe("ready");
        expect(first.loginCalls).toBe(2);
    });

    it("stop sonrasi komut yonlendiricisi eski istemcide kalir mi kontrol eder", async () => {
        const client = new FakeClient();
        const bot = createBot({}, client);

        const started = bot.start();

        await Promise.resolve();
        client.emitReady();
        await started;

        expect(client.listenerCount("interactionCreate")).toBe(1);

        await bot.stop();

        expect(client.listenerCount("interactionCreate")).toBe(0);
    });
});

describe("DissoraBot - kayitli zamanlayici temizligi", () => {
    it("basarisiz start sonrasi kayitli zamanlayici kalir mi", async () => {
        // Gecersiz intent: `createClient()` hata firlatir, `shutdown` kurulmaz.
        const bot = createBot({ intents: ["GecersizIntent"] as never });

        bot.timers.every("test", 60_000, () => undefined);

        expect(bot.timers.size).toBe(1);

        await expect(bot.start()).rejects.toThrow(/Gecersiz intent/);

        // Sureci ayakta tutan orphan timer olmamali.
        expect(bot.timers.size).toBe(0);
    });
});

describe("DissoraBot - onDispose", () => {
    it("kapanista kayitli temizlik calistirilir", async () => {
        const client = new FakeClient();
        const bot = createBot({}, client);
        const disposer = vi.fn();

        bot.onDispose(disposer);

        const started = bot.start();

        await Promise.resolve();
        client.emitReady();
        await started;

        await bot.stop();

        expect(disposer).toHaveBeenCalledOnce();
    });
});
