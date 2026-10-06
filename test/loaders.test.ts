import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseModuleConfig } from "../src/config/module-config.js";
import {
    createModuleRuntime,
    type ModuleRuntime
} from "../src/core/ModuleRuntime.js";
import { Registry } from "../src/core/Registry.js";
import { AlwaysLoader } from "../src/loaders/AlwaysLoader.js";
import {
    CommandLoader,
    isValidCommandName,
    normalizeCommandData,
    normalizeCommandName
} from "../src/loaders/CommandLoader.js";
import { EventLoader } from "../src/loaders/EventLoader.js";
import { Logger } from "../src/services/Logger.js";
import { TimerRegistry } from "../src/services/TimerRegistry.js";

let root: string;
let registry: Registry;
let timers: TimerRegistry;
let logger: Logger;
const emitter = new EventEmitter();

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dissora-test-"));
    registry = new Registry();
    timers = new TimerRegistry();
    logger = new Logger({ level: "silent", out: sink(), err: sink() });
    emitter.removeAllListeners();
});

afterEach(() => {
    timers.clearAll();
    rmSync(root, { recursive: true, force: true });
});

function write(relative: string, content: string): void {
    const file = join(root, relative);

    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content, "utf8");
}

function runtimeFor(
    name: string,
    config: Record<string, unknown>
): ModuleRuntime {
    return createModuleRuntime({
        name,
        declaredName: name,
        folder: join(root, name),
        version: "1.0.0",
        config: parseModuleConfig({ name, ...config })
    });
}

function contextFor(name: string, config: Record<string, unknown>) {
    const runtime = runtimeFor(name, config);

    return {
        runtime,
        client: emitter as never,
        logger,
        registry,
        timers,
        paths: { root } as never,
        resolved: {} as never,
        modulesDirName: "Modules",
        moduleContext: { client: emitter } as never
    };
}

describe("isValidCommandName", () => {
    it("gecerli adlari kabul eder", () => {
        for (const name of [
            "ping",
            "test-1",
            "test_1",
            "eklenti",
            "Test",
            "şifre"
        ]) {
            expect(isValidCommandName(name)).toBe(true);
        }
    });

    it("gecersiz adlari reddeder", () => {
        for (const name of ["", "a".repeat(33), "test 1", "test!", "a/b"]) {
            expect(isValidCommandName(name)).toBe(false);
        }
    });
});

describe("normalizeCommandName", () => {
    it("bosluk kirpar ve kucuk harfe indirger", () => {
        expect(normalizeCommandName("  PING ")).toBe("ping");
        expect(normalizeCommandName("Test")).toBe("test");
        expect(normalizeCommandName("zaten-kucuk")).toBe("zaten-kucuk");
    });
});

describe("normalizeCommandData - Discord kucuk harf kurali", () => {
    it("name alanindan buyuk harfli komut kucultulur", () => {
        const data = normalizeCommandData({
            name: "PING",
            description: "pong",
            execute: () => undefined
        } as never);

        expect(data.name).toBe("ping");
    });

    it("data.name alanindan buyuk harfli komut kucultulur", () => {
        const data = normalizeCommandData({
            data: { name: "Test", description: "aciklama" },
            execute: () => undefined
        } as never);

        expect(data.name).toBe("test");
    });
});

describe("normalizeCommandData", () => {
    it("builder'i JSON'a cevirir", () => {
        const data = normalizeCommandData({
            data: {
                toJSON: () => ({ name: "ping", description: "Pong" })
            },
            execute: () => undefined
        });

        expect(data).toEqual({ name: "ping", description: "Pong" });
    });

    it("name alanindan komut uretir", () => {
        const data = normalizeCommandData({
            name: "ping",
            execute: () => undefined
        });

        expect(data).toEqual({ name: "ping", description: "Dissora komutu" });
    });

    it("bos description yerine varsayilan yazar", () => {
        const data = normalizeCommandData({
            data: { name: "ping", description: "" },
            execute: () => undefined
        });

        expect(data.description).toBe("Dissora komutu");
    });

    it("data ve name yoksa hata firlatir", () => {
        expect(() =>
            normalizeCommandData({ execute: () => undefined }, "Command/x.js")
        ).toThrow(/data ya da name gerekli/);
    });

    it("data.name zorunludur", () => {
        // JavaScript kullanicilari eksik alanla gelebilir; tip zorlamasi yok.
        const incomplete = {
            data: { description: "x" },
            execute: () => undefined
        };

        expect(() => normalizeCommandData(incomplete as never, "f.js")).toThrow(
            /data.name gerekli/
        );
    });
});

describe("CommandLoader", () => {
    it("Command/ klasorunu otomatik tarar", async () => {
        write(
            "Mod/Command/ping.js",
            "module.exports = { name: 'ping', execute: () => 'pong' };"
        );
        write(
            "Mod/Command/yardim.js",
            "module.exports = { name: 'yardim', execute: () => 'help' };"
        );

        const context = contextFor("Mod", {});
        await new CommandLoader().load(context);

        expect(registry.commandNames()).toEqual(["ping", "yardim"]);
        expect(context.runtime.commands).toEqual(["ping", "yardim"]);
    });

    it("config listesindeki dosyalari yukler", async () => {
        write("Mod/a.js", "module.exports = { name: 'a', execute: () => 1 };");

        const context = contextFor("Mod", {
            commands: { enabled: true, files: ["a.js"] }
        });
        await new CommandLoader().load(context);

        expect(registry.commandNames()).toEqual(["a"]);
    });

    it("commands.enabled false ise hicbir sey yuklemez", async () => {
        write(
            "Mod/Command/ping.js",
            "module.exports = { name: 'ping', execute: () => 1 };"
        );

        const context = contextFor("Mod", { commands: { enabled: false } });
        await new CommandLoader().load(context);

        expect(registry.commands.size).toBe(0);
    });

    it("bir komut dosyasi hatali olsa digerleri yuklenir", async () => {
        write(
            "Mod/Command/iyi.js",
            "module.exports = { name: 'iyi', execute: () => 1 };"
        );
        write("Mod/Command/kotu.js", "module.exports = { nope: true };");

        const context = contextFor("Mod", {});
        await new CommandLoader().load(context);

        expect(registry.commandNames()).toEqual(["iyi"]);
    });

    it("config adiyla data.name uyusmazsa atlanir", async () => {
        write(
            "Mod/Command/ping.js",
            "module.exports = { name: 'ping', execute: () => 1 };"
        );

        const context = contextFor("Mod", {
            commands: {
                enabled: true,
                files: [{ file: "Command/ping.js", name: "baska" }]
            }
        });
        await new CommandLoader().load(context);

        expect(registry.commands.size).toBe(0);
    });

    it("gecersiz komut adi reddedilir", async () => {
        write(
            "Mod/Command/x.js",
            "module.exports = { name: 'Cok Uzun Bir Ad Burada', execute: () => 1 };"
        );

        const context = contextFor("Mod", {});
        await new CommandLoader().load(context);

        expect(registry.commands.size).toBe(0);
    });

    it("kayit anahtari data.name olur", async () => {
        write(
            "Mod/Command/dosya-adi.js",
            "module.exports = { data: { name: 'gercek-ad', description: 'x' }, execute: () => 1 };"
        );

        const context = contextFor("Mod", {});
        await new CommandLoader().load(context);

        expect(registry.commandNames()).toEqual(["gercek-ad"]);
    });

    it("buyuk harfli data.name kucultulerek kaydedilir", async () => {
        write(
            "Mod/Command/ping.js",
            "module.exports = { data: { name: 'PING', description: 'x' }, execute: () => 1 };"
        );

        const context = contextFor("Mod", {});
        await new CommandLoader().load(context);

        // Discord buyuk harfli komut adini reddeder.
        expect(registry.commandNames()).toEqual(["ping"]);
        expect(registry.getCommand("ping")?.data.name).toBe("ping");
    });

    it("config adi buyuk harfliyse atlanmaz", async () => {
        write(
            "Mod/Command/ping.js",
            "module.exports = { data: { name: 'ping', description: 'x' }, execute: () => 1 };"
        );

        const context = contextFor("Mod", {
            commands: {
                enabled: true,
                files: [{ file: "Command/ping.js", name: "PING" }]
            }
        });

        await new CommandLoader().load(context);

        expect(registry.commandNames()).toEqual(["ping"]);
    });
});

describe("EventLoader", () => {
    it("config'teki event'i baglar", async () => {
        write(
            "Mod/Event/x.js",
            "module.exports = { event: 'ready', execute: () => 'ok' };"
        );

        const context = contextFor("Mod", {
            events: {
                enabled: true,
                files: [{ event: "messageCreate", file: "Event/x.js" }]
            }
        });
        await new EventLoader().load(context);

        expect(context.runtime.events).toEqual(["messageCreate"]);
        expect(registry.events[0]?.event).toBe("messageCreate");
    });

    it("dosyanin kendi event alanini kullanir", async () => {
        write(
            "Mod/Event/x.js",
            "module.exports = { event: 'ready', execute: () => 'ok' };"
        );

        const context = contextFor("Mod", {
            events: { enabled: true, files: ["Event/x.js"] }
        });
        await new EventLoader().load(context);

        expect(context.runtime.events).toEqual(["ready"]);
    });

    it("dosyadan fonksiyon exportlanirsa event adi config'den gelmeli", async () => {
        write("Mod/Event/x.js", "module.exports = () => 'ok';");

        const context = contextFor("Mod", {
            events: {
                enabled: true,
                files: [{ file: "Event/x.js", event: "ready" }]
            }
        });
        await new EventLoader().load(context);

        expect(context.runtime.events).toEqual(["ready"]);
    });

    it("event adi ne config'te ne de dosyada yoksa atlanir", async () => {
        write("Mod/Event/x.js", "module.exports = { execute: () => 'ok' };");

        const context = contextFor("Mod", {
            events: { enabled: true, files: ["Event/x.js"] }
        });
        await new EventLoader().load(context);

        expect(context.runtime.events).toEqual([]);
    });

    it("hatasi olay icinde yakalanir", async () => {
        write(
            "Mod/Event/x.js",
            "module.exports = { event: 'ready', execute: () => { throw new Error('ic hata'); } };"
        );

        const context = contextFor("Mod", {
            events: { enabled: true, files: ["Event/x.js"] }
        });
        await new EventLoader().load(context);

        expect(() => emitter.emit("ready")).not.toThrow();
    });

    it("asenkron hata (rejected promise) sessizce yutulmaz", async () => {
        const rejections: unknown[] = [];

        const onRejection = (reason: unknown): void => {
            rejections.push(reason);
        };

        process.on("unhandledRejection", onRejection);

        try {
            write(
                "Mod/Event/x.js",
                "module.exports = { event: 'ready', execute: async () => { throw new Error('asenkron hata'); } };"
            );

            const context = contextFor("Mod", {
                events: { enabled: true, files: ["Event/x.js"] }
            });

            await new EventLoader().load(context);

            expect(() => emitter.emit("ready")).not.toThrow();

            // Rejection'in yakalanmasi ve islenmesi icin mikrobosluk birak.
            await new Promise(resolve => setImmediate(resolve));

            expect(rejections).toEqual([]);
        } finally {
            process.off("unhandledRejection", onRejection);
        }
    });

    it("thenable (ozel then) reddi de yakalanir", async () => {
        write(
            "Mod/Event/x.js",
            `module.exports = {
                event: 'ready',
                execute: () => ({ then: (resolve, reject) => reject(new Error('thenable hata')) })
            };`
        );

        const context = contextFor("Mod", {
            events: { enabled: true, files: ["Event/x.js"] }
        });

        await new EventLoader().load(context);

        expect(() => emitter.emit("ready")).not.toThrow();

        await new Promise(resolve => setImmediate(resolve));
    });

    it("once secimi calisir", async () => {
        write(
            "Mod/Event/x.js",
            "module.exports = { event: 'ready', once: true, execute: () => 1 };"
        );

        const context = contextFor("Mod", {
            events: { enabled: true, files: ["Event/x.js"] }
        });
        await new EventLoader().load(context);

        expect(context.runtime.events).toEqual(["ready (once)"]);
        expect(emitter.listenerCount("ready")).toBe(1);
    });

    it("baglanan dinleyiciler detach edilebilir", async () => {
        write(
            "Mod/Event/x.js",
            "module.exports = { event: 'ready', execute: () => 1 };"
        );

        const context = contextFor("Mod", {
            events: { enabled: true, files: ["Event/x.js"] }
        });
        await new EventLoader().load(context);

        expect(emitter.listenerCount("ready")).toBe(1);
        expect(registry.detachBindings()).toBe(1);
        expect(emitter.listenerCount("ready")).toBe(0);
    });

    it("config event adi dosyadakini ezer", async () => {
        write(
            "Mod/Event/x.js",
            "module.exports = { event: 'messageCreate', execute: () => 1 };"
        );

        const context = contextFor("Mod", {
            events: {
                enabled: true,
                files: [{ file: "Event/x.js", event: "ready" }]
            }
        });
        await new EventLoader().load(context);

        expect(context.runtime.events).toEqual(["ready"]);
    });
});

describe("AlwaysLoader", () => {
    it("periyodik gorev baslatir", async () => {
        write("Mod/Always/t.js", "module.exports = () => undefined;");

        const context = contextFor("Mod", {
            always: {
                enabled: true,
                tasks: [{ file: "Always/t.js", interval: 60000 }]
            }
        });
        await new AlwaysLoader().load(context);

        expect(context.runtime.tasks).toEqual(["Mod/Always/t.js"]);
        expect(timers.size).toBe(1);
    });

    it("{ execute } seklini de kabul eder", async () => {
        write(
            "Mod/Always/t.js",
            "module.exports = { execute: () => undefined };"
        );

        const context = contextFor("Mod", {
            always: {
                enabled: true,
                tasks: [{ file: "Always/t.js", interval: 60000 }]
            }
        });
        await new AlwaysLoader().load(context);

        expect(timers.size).toBe(1);
    });

    it("runOnStart bir kez calistirir", async () => {
        write(
            "Mod/Always/t.js",
            "module.exports = { execute: () => { globalThis.__dissoraTick = (globalThis.__dissoraTick || 0) + 1; } };"
        );

        const context = contextFor("Mod", {
            always: {
                enabled: true,
                tasks: [
                    { file: "Always/t.js", interval: 60000, runOnStart: true }
                ]
            }
        });
        await new AlwaysLoader().load(context);

        await new Promise(resolve => setImmediate(resolve));
        expect((globalThis as Record<string, unknown>).__dissoraTick).toBe(1);

        delete (globalThis as Record<string, unknown>).__dissoraTick;
    });

    it("always.enabled false ise gorev baslatmaz", async () => {
        write("Mod/Always/t.js", "module.exports = () => undefined;");

        const context = contextFor("Mod", {
            always: { enabled: false, tasks: [] }
        });
        await new AlwaysLoader().load(context);

        expect(timers.size).toBe(0);
    });

    it("gecersiz gorev dosyasi atlanir", async () => {
        write("Mod/Always/t.js", "module.exports = { nope: 1 };");

        const context = contextFor("Mod", {
            always: {
                enabled: true,
                tasks: [{ file: "Always/t.js", interval: 60000 }]
            }
        });
        await new AlwaysLoader().load(context);

        expect(timers.size).toBe(0);
    });

    // Regresyon: `defineAlways` sonucundaki `interval` / `runOnStart` /
    // `name` daha once hiç okunmuyordu; config her zaman kazanıyordu.
    it("dosyadaki interval config'i ezer", async () => {
        write(
            "Mod/Always/t.js",
            "module.exports = { interval: 1234, execute: () => undefined };"
        );

        const context = contextFor("Mod", {
            always: {
                enabled: true,
                tasks: [{ file: "Always/t.js", interval: 60000 }]
            }
        });
        await new AlwaysLoader().load(context);

        expect(timers.active()[0]?.interval).toBe(1234);
    });

    it("dosyada interval yoksa config kullanilir", async () => {
        write(
            "Mod/Always/t.js",
            "module.exports = { execute: () => undefined };"
        );

        const context = contextFor("Mod", {
            always: {
                enabled: true,
                tasks: [{ file: "Always/t.js", interval: 60000 }]
            }
        });
        await new AlwaysLoader().load(context);

        expect(timers.active()[0]?.interval).toBe(60000);
    });

    it("dosyadaki runOnStart config'i ezer", async () => {
        write(
            "Mod/Always/t.js",
            "module.exports = { runOnStart: true, execute: () => { globalThis.__dissoraTick2 = (globalThis.__dissoraTick2 || 0) + 1; } };"
        );

        const context = contextFor("Mod", {
            always: {
                enabled: true,
                tasks: [{ file: "Always/t.js", interval: 60000 }]
            }
        });
        await new AlwaysLoader().load(context);

        await new Promise(resolve => setImmediate(resolve));
        expect((globalThis as Record<string, unknown>).__dissoraTick2).toBe(1);

        delete (globalThis as Record<string, unknown>).__dissoraTick2;
    });

    it("dosyadaki name zamanlayici etiketini belirler", async () => {
        write(
            "Mod/Always/t.js",
            "module.exports = { name: 'rapor', execute: () => undefined };"
        );

        const context = contextFor("Mod", {
            always: {
                enabled: true,
                tasks: [{ file: "Always/t.js", interval: 60000 }]
            }
        });
        await new AlwaysLoader().load(context);

        expect(context.runtime.tasks).toEqual(["Mod/rapor"]);
        expect(timers.size).toBe(1);
    });

    it("gecersiz dosya interval'i config'e dusulur", async () => {
        write(
            "Mod/Always/t.js",
            "module.exports = { interval: -1, execute: () => undefined };"
        );

        const context = contextFor("Mod", {
            always: {
                enabled: true,
                tasks: [{ file: "Always/t.js", interval: 60000 }]
            }
        });
        await new AlwaysLoader().load(context);

        // Negatif deger reddedilir, config'teki gecerli periyot kullanilir.
        expect(timers.active()[0]?.interval).toBe(60000);
    });
});

function sink(): NodeJS.WritableStream {
    return { write: (): boolean => true } as unknown as NodeJS.WritableStream;
}
