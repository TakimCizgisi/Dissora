import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { RegisteredCommand } from "../src/core/Registry.js";
import { Registry } from "../src/core/Registry.js";
import { Shutdown } from "../src/core/Shutdown.js";
import { Logger } from "../src/services/Logger.js";
import { TimerRegistry } from "../src/services/TimerRegistry.js";

function command(name: string): RegisteredCommand {
    return {
        name,
        data: { name, description: "test" },
        execute: () => undefined,
        module: "Test",
        source: null
    };
}

describe("Registry", () => {
    it("komutlari ada gore kaydeder", () => {
        const registry = new Registry();

        registry.addCommand(command("ping"));

        expect(registry.getCommand("ping")?.module).toBe("Test");
        expect(registry.hasCommand("ping")).toBe(true);
        expect(registry.getCommand("yok")).toBeUndefined();
    });

    it("ayni ad ikinci kez yazilirsa tek kayit kalir", () => {
        const registry = new Registry();

        registry.addCommand(command("ping"));
        registry.addCommand({ ...command("ping"), module: "Diger" });

        expect(registry.commands.size).toBe(1);
        expect(registry.getCommand("ping")?.module).toBe("Diger");
    });

    it("commandNames alfabetik siralir", () => {
        const registry = new Registry();

        registry.addCommand(command("zeta"));
        registry.addCommand(command("alfa"));

        expect(registry.commandNames()).toEqual(["alfa", "zeta"]);
    });

    it("temizlik kayitlarini sirayla calistirir", async () => {
        const registry = new Registry();
        const order: string[] = [];

        registry.addDisposer(() => order.push("a"));
        registry.addDisposer(async () => {
            await Promise.resolve();
            order.push("b");
        });

        const report = await registry.runDisposers();

        expect(order).toEqual(["a", "b"]);
        expect(report).toEqual({ ran: 2, failed: 0 });
    });

    it("hatali temizlik digerlerini durdurmaz", async () => {
        const registry = new Registry();
        const after = vi.fn();

        registry.addDisposer(() => {
            throw new Error("patladi");
        });
        registry.addDisposer(after);

        const report = await registry.runDisposers();

        expect(after).toHaveBeenCalledOnce();
        expect(report).toEqual({ ran: 1, failed: 1 });
    });

    it("temizlik kayitlari bir kez calistirilir", async () => {
        const registry = new Registry();
        const disposer = vi.fn();

        registry.addDisposer(disposer);

        await registry.runDisposers();
        await registry.runDisposers();

        expect(disposer).toHaveBeenCalledOnce();
    });

    it("yalnizca takip edilen dinleyicileri kaldirir", () => {
        const registry = new Registry();
        const emitter = new EventEmitter();
        const framework = vi.fn();
        const userHandler = vi.fn();

        emitter.on("ready", framework);
        emitter.on("ready", userHandler);

        registry.trackBinding({
            emitter: emitter as unknown as {
                removeListener: (
                    e: string,
                    h: (...args: never[]) => unknown
                ) => unknown;
            },
            event: "ready",
            handler: framework
        });

        expect(registry.detachBindings()).toBe(1);
        expect(emitter.listenerCount("ready")).toBe(1);

        emitter.emit("ready");
        expect(framework).not.toHaveBeenCalled();
        expect(userHandler).toHaveBeenCalledOnce();
    });

    it("reset tum kayitlari temizler", () => {
        const registry = new Registry();

        registry.addCommand(command("ping"));
        registry.addEvent({
            event: "ready",
            module: "A",
            source: null,
            once: false,
            handler: () => undefined
        });
        registry.addDisposer(() => undefined);

        registry.reset();

        expect(registry.commands.size).toBe(0);
        expect(registry.events).toHaveLength(0);
        expect(registry.disposerCount).toBe(0);
    });

    it("snapshot sonrasi eklenenleri geri alir", () => {
        const registry = new Registry();
        const emitter = new EventEmitter();
        const kept = vi.fn();
        const dropped = vi.fn();

        registry.addCommand(command("kalan"));
        registry.addEvent({
            event: "ready",
            module: "A",
            source: null,
            once: false,
            handler: () => undefined
        });
        registry.addDisposer(() => undefined);

        const snapshot = registry.snapshot();

        registry.addCommand(command("dusen"));
        registry.addEvent({
            event: "messageCreate",
            module: "B",
            source: null,
            once: false,
            handler: () => undefined
        });
        registry.addDisposer(() => undefined);
        registry.trackBinding({
            emitter: emitter as never,
            event: "ready",
            handler: dropped
        });

        expect(registry.rollback(snapshot)).toBeUndefined();
        expect(registry.commandNames()).toEqual(["kalan"]);
        expect(registry.events).toHaveLength(1);
        expect(registry.disposerCount).toBe(1);
        expect(emitter.listenerCount("ready")).toBe(0);

        emitter.on("ready", kept);
        emitter.emit("ready");
        expect(kept).toHaveBeenCalledOnce();
    });

    it("rollback ezilen komutun eskisini geri koyar", () => {
        const registry = new Registry();
        const original = command("ping");
        const attacker = command("ping");

        registry.addCommand(original);

        const snapshot = registry.snapshot();

        // Ayni ada yeni bir kayit yazilir: boyut degismez.
        registry.addCommand(attacker);

        expect(registry.count).toBe(1);
        expect(registry.getCommand("ping")).toBe(attacker);

        registry.rollback(snapshot);

        expect(registry.getCommand("ping")).toBe(original);
        expect(registry.count).toBe(1);
    });

    it("rollback farkli adlari birbirine karistirmaz", () => {
        const registry = new Registry();
        const first = command("ping");
        const help = command("help");

        registry.addCommand(first);
        registry.addCommand(help);

        const snapshot = registry.snapshot();

        registry.addCommand(command("ping"));
        registry.addCommand(command("yeni"));

        registry.rollback(snapshot);

        expect(registry.getCommand("ping")).toBe(first);
        expect(registry.getCommand("help")).toBe(help);
        expect(registry.hasCommand("yeni")).toBe(false);
        expect(registry.commandNames()).toEqual(["help", "ping"]);
    });

    it("komut adlari kucuk harfe normalize edilir", () => {
        const registry = new Registry();

        registry.addCommand(command("PING"));

        expect(registry.hasCommand("ping")).toBe(true);
        expect(registry.getCommand("PING")?.name).toBe("ping");
        expect(registry.getCommand("ping")?.module).toBe(
            command("PING").module
        );
    });
});

describe("TimerRegistry", () => {
    it("periyodik gorev baslatir ve temizlenir", async () => {
        vi.useFakeTimers();

        try {
            const registry = new TimerRegistry();
            const task = vi.fn();

            registry.every("test", 1000, task);
            expect(registry.size).toBe(1);

            vi.advanceTimersByTime(3000);
            expect(task).toHaveBeenCalledTimes(3);

            expect(registry.clearAll()).toBe(1);
            expect(registry.size).toBe(0);

            vi.advanceTimersByTime(5000);
            expect(task).toHaveBeenCalledTimes(3);
        } finally {
            vi.useRealTimers();
        }
    });

    it("async hata bir sonraki tick'i engellemez", async () => {
        vi.useFakeTimers();

        try {
            const errors: string[] = [];
            const stream = sink();
            const logger = new Logger({
                level: "debug",
                out: stream,
                err: stream
            });
            const registry = new TimerRegistry(logger);
            let calls = 0;

            registry.every("patlayan", 1000, async () => {
                calls++;

                if (calls === 1) {
                    throw new Error("bir kez hata");
                }
            });

            vi.advanceTimersByTime(3000);
            await Promise.resolve();

            expect(calls).toBe(3);
            expect(errors).toEqual([]);
            registry.clearAll();
        } finally {
            vi.useRealTimers();
        }
    });

    it("run hatalari yutar", async () => {
        const registry = new TimerRegistry();

        await expect(
            registry.run("x", () => {
                throw new Error("hata");
            })
        ).resolves.toBeUndefined();
    });

    it("handle iptali", () => {
        vi.useFakeTimers();

        try {
            const registry = new TimerRegistry();
            const task = vi.fn();
            const handle = registry.every("x", 1000, task);

            handle.cancel();
            expect(registry.size).toBe(0);

            vi.advanceTimersByTime(5000);
            expect(task).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("rollback yalnizca yeni zamanlayicilari iptal eder", () => {
        vi.useFakeTimers();

        try {
            const registry = new TimerRegistry();
            const before = vi.fn();
            const after = vi.fn();

            registry.every("once", 1000, before);
            const snapshot = registry.mark();
            registry.every("iki", 1000, after);

            expect(registry.rollback(snapshot)).toBe(1);
            expect(registry.size).toBe(1);
            expect(registry.active()[0]?.label).toBe("once");

            vi.advanceTimersByTime(2000);
            expect(before).toHaveBeenCalledTimes(2);
            expect(after).not.toHaveBeenCalled();

            registry.clearAll();
        } finally {
            vi.useRealTimers();
        }
    });

    it("rollback, iptal edilmis zamanlayicidan sonra da dogru hedefi isaretler", () => {
        vi.useFakeTimers();

        try {
            const registry = new TimerRegistry();
            const keep = vi.fn();
            const doomed = vi.fn();
            const unrelated = vi.fn();

            registry.every("once", 1000, keep);

            const mark = registry.mark();

            registry.every("iki", 1000, doomed);
            registry.every("ucuncu", 1000, unrelated);

            // Aradaki zamanlayici iptal edilir: sayim tabanli rollback
            // "ucuncu"yu yanlis bir konuma eslestirirdi.
            registry.every("dort", 1000, doomed).cancel();

            expect(registry.size).toBe(3);
            expect(registry.rollback(mark)).toBe(2);
            expect(registry.size).toBe(1);
            expect(registry.active()[0]?.label).toBe("once");

            vi.advanceTimersByTime(2000);
            expect(keep).toHaveBeenCalledTimes(2);
            expect(doomed).not.toHaveBeenCalled();
            expect(unrelated).not.toHaveBeenCalled();

            registry.clearAll();
        } finally {
            vi.useRealTimers();
        }
    });

    it("isaretten sonra yeni zamanlayici yoksa rollback 0 doner", () => {
        const registry = new TimerRegistry();

        registry.every("a", 1000, () => undefined);

        const mark = registry.mark();

        expect(registry.rollback(mark)).toBe(0);
        expect(registry.size).toBe(1);

        registry.clearAll();
    });

    it("isaretten sonra yeni zamanlayici varsa rollback yine hedefler", () => {
        vi.useFakeTimers();

        try {
            const registry = new TimerRegistry();

            registry.every("a", 1000, () => undefined);

            const mark = registry.mark();

            registry.every("b", 1000, () => undefined);

            expect(registry.rollback(mark)).toBe(1);
            expect(registry.size).toBe(1);

            registry.clearAll();
        } finally {
            vi.useRealTimers();
        }
    });

    it("active() etiketleri listeler", () => {
        vi.useFakeTimers();

        try {
            const registry = new TimerRegistry();

            registry.every("a", 1000, () => undefined);
            registry.every("b", 2000, () => undefined);

            expect(registry.active()).toEqual([
                { label: "a", interval: 1000 },
                { label: "b", interval: 2000 }
            ]);
            registry.clearAll();
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("Shutdown", () => {
    it("sinyal, temizlik, event, zamanlayici ve baglanti sirasiyla", async () => {
        const order: string[] = [];
        const emitter = new EventEmitter();
        const registry = new Registry();
        const timers = new TimerRegistry();
        const client = { destroy: async () => void order.push("destroy") };

        emitter.on("ready", () => order.push("kullanici-dinleyicisi"));

        registry.addDisposer(() => order.push("dispose"));
        registry.trackBinding({
            emitter: emitter as unknown as {
                removeListener: (
                    e: string,
                    h: (...args: never[]) => unknown
                ) => unknown;
            },
            event: "ready",
            handler: () => order.push("framework-dinleyicisi")
        });

        vi.useFakeTimers();

        try {
            timers.every("x", 1000, () => undefined);
        } finally {
            vi.useRealTimers();
        }

        const shutdown = new Shutdown({
            logger: silentLogger(),
            registry,
            timers,
            client: client as never,
            exit: () => order.push("exit"),
            onFinish: reason => void order.push(`finish:${reason}`)
        });

        await shutdown.run("manual");

        // Framework dinleyicisi cagrilmaz, yalnizca baglanir; kullanici dinleyicisi korunur.
        expect(order).toEqual(["dispose", "destroy", "finish:manual", "exit"]);
        expect(order).not.toContain("framework-dinleyicisi");
        expect(timers.size).toBe(0);
        expect(emitter.listenerCount("ready")).toBe(1);

        emitter.emit("ready");
        expect(order).toContain("kullanici-dinleyicisi");
    });

    it("cift cagriyi yoksayir", async () => {
        const registry = new Registry();
        const exit = vi.fn();
        const shutdown = new Shutdown({
            logger: silentLogger(),
            registry,
            timers: new TimerRegistry(),
            client: null,
            exit,
            signals: []
        });

        await Promise.all([shutdown.run("manual"), shutdown.run("signal")]);

        expect(exit).toHaveBeenCalledOnce();
    });

    it("bitince isareti temizler, yeniden kullanilabilir", async () => {
        const shutdown = new Shutdown({
            logger: silentLogger(),
            registry: new Registry(),
            timers: new TimerRegistry(),
            client: null,
            exit: () => undefined,
            signals: []
        });

        expect(shutdown.isRunning).toBe(false);

        const running = shutdown.run("error", 1);

        expect(shutdown.isRunning).toBe(true);

        await running;

        // `dissora dev` ayni Shutdown nesnesini yeniden kullanir; isaret
        // temizlenmezse ikinci restart sessizce yoksayilir.
        expect(shutdown.isRunning).toBe(false);
    });

    it("exitProcess false ise processi sonlandirmaz", async () => {
        const exit = vi.fn();
        const shutdown = new Shutdown({
            logger: silentLogger(),
            registry: new Registry(),
            timers: new TimerRegistry(),
            client: null,
            exit,
            signals: []
        });

        await shutdown.run("error", 1, false);

        expect(exit).not.toHaveBeenCalled();
    });

    it("es zamanli ikinci cagri ayni kapanisi bekler", async () => {
        const order: string[] = [];
        let releaseDestroy: () => void = () => undefined;
        const destroyed = new Promise<void>(resolve => {
            releaseDestroy = resolve;
        });

        const shutdown = new Shutdown({
            logger: silentLogger(),
            registry: new Registry(),
            timers: new TimerRegistry(),
            client: { destroy: () => destroyed } as never,
            exit: () => undefined,
            signals: [],
            onFinish: reason => void order.push(`finish:${reason}`)
        });

        const first = shutdown.run("dev-restart", 0, false);
        const second = shutdown.run("signal", 0, false);

        // Ikinci cagri `destroy()` bitmeden cozulmemeli.
        await Promise.resolve();
        expect(order).toEqual([]);

        releaseDestroy();
        await Promise.all([first, second]);

        // Temizlik dizisi yalnizca bir kez calisti.
        expect(order).toEqual(["finish:dev-restart"]);
    });

    it("guard dinleyicilerini unregister ile kaldirir", () => {
        const before = {
            rejection: process.listenerCount("unhandledRejection"),
            exception: process.listenerCount("uncaughtException")
        };

        const shutdown = new Shutdown({
            logger: silentLogger(),
            registry: new Registry(),
            timers: new TimerRegistry(),
            client: null,
            exit: () => undefined,
            signals: []
        });

        shutdown.guard();

        expect(process.listenerCount("unhandledRejection")).toBe(
            before.rejection + 1
        );
        expect(process.listenerCount("uncaughtException")).toBe(
            before.exception + 1
        );

        // Cift guard ayni dinleyicileri iki kez eklemez.
        shutdown.guard();
        expect(process.listenerCount("unhandledRejection")).toBe(
            before.rejection + 1
        );

        shutdown.unguard();

        expect(process.listenerCount("unhandledRejection")).toBe(
            before.rejection
        );
        expect(process.listenerCount("uncaughtException")).toBe(
            before.exception
        );
    });

    it("guard dinleyicileri kapanista temizlenir", async () => {
        const before = process.listenerCount("uncaughtException");

        const shutdown = new Shutdown({
            logger: silentLogger(),
            registry: new Registry(),
            timers: new TimerRegistry(),
            client: null,
            exit: () => undefined,
            signals: []
        });

        shutdown.guard();

        expect(process.listenerCount("uncaughtException")).toBe(before + 1);

        await shutdown.run("manual", 0, false);

        // Dinleyici kalirsa `dev` her restart'ta sureci kirletir.
        expect(process.listenerCount("uncaughtException")).toBe(before);
    });

    it("client yoksa da temizlik calisir", async () => {
        const registry = new Registry();
        const exit = vi.fn();
        const disposer = vi.fn();

        registry.addDisposer(disposer);

        await new Shutdown({
            logger: silentLogger(),
            registry,
            timers: new TimerRegistry(),
            client: null,
            exit,
            signals: []
        }).run("manual");

        expect(disposer).toHaveBeenCalledOnce();
        expect(exit).toHaveBeenCalledWith(0);
    });
});

function silentLogger(): Logger {
    const stream = sink();

    return new Logger({ level: "silent", out: stream, err: stream });
}

function sink(): NodeJS.WritableStream {
    return {
        write(): boolean {
            return true;
        }
    } as unknown as NodeJS.WritableStream;
}
