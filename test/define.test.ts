import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    defineAlways,
    defineCommand,
    defineEvent
} from "../src/types/define.js";
import { loadModuleFile, missingPackage } from "../src/utils/load-module.js";

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dissora-define-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("defineCommand", () => {
    it("nesneyi oldugu gibi dondurur", () => {
        const command = { data: { name: "ping" }, execute: () => 1 };

        expect(defineCommand(command)).toBe(command);
    });

    it("execute yoksa hata verir", () => {
        expect(() =>
            defineCommand({ data: { name: "ping" } } as never)
        ).toThrow(/execute/);
    });
});

describe("defineEvent", () => {
    it("konumsel bicimi destekler", () => {
        const execute = (): number => 1;
        const event = defineEvent("ready", execute);

        expect(event.event).toBe("ready");
        expect(event.execute).toBe(execute);
        expect(event.once).toBeUndefined();
    });

    it("konumsel bicimde once secenegini aktarir", () => {
        expect(defineEvent("ready", () => 1, { once: true }).once).toBe(true);
    });

    it("nesne bicimini destekler", () => {
        const execute = (): number => 2;
        const event = defineEvent({ event: "ready", execute, once: true });

        expect(event.event).toBe("ready");
        expect(event.execute).toBe(execute);
        expect(event.once).toBe(true);
    });

    it("event adini dogrular", () => {
        expect(() =>
            defineEvent({ event: "" as never, execute: () => 1 })
        ).toThrow(/event adi/);
    });

    it("execute fonksiyonunu dogrular", () => {
        expect(() =>
            defineEvent({ event: "ready", execute: 1 as never })
        ).toThrow(/execute/);
    });

    it("pozisyonel hatali cagri da dogrulanir", () => {
        expect(() => defineEvent("ready", undefined as never)).toThrow(
            /execute/
        );
    });
});

describe("defineAlways", () => {
    it("konumsel bicimi destekler", () => {
        const execute = (): number => 1;
        const task = defineAlways(execute, { interval: 1000 });

        expect(task.interval).toBe(1000);
        expect(task.execute).toBe(execute);
        expect(task.runOnStart).toBeUndefined();
    });

    it("nesne bicimini destekler", () => {
        const execute = (): number => 1;
        const task = defineAlways({ interval: 500, execute, runOnStart: true });

        expect(task.interval).toBe(500);
        expect(task.execute).toBe(execute);
        expect(task.runOnStart).toBe(true);
    });

    it("execute fonksiyonunu dogrular", () => {
        expect(() =>
            defineAlways({ interval: 100, execute: undefined as never })
        ).toThrow(/execute/);
    });

    it("interval degerini dogrular", () => {
        expect(() => defineAlways({ interval: 0, execute: () => 1 })).toThrow(
            /interval/
        );
        expect(() =>
            defineAlways({ interval: Number.NaN, execute: () => 1 })
        ).toThrow(/interval/);
    });

    // Regresyon: interval `moduleconfig.json`'da da verilebiliyor.
    // Dosyada hicbir sey yazilmadiginda `defineAlways` **hata vermemeli**,
    // yoksa config'te tanimli her gorev kullanilamaz hale geliyordu.
    it("interval verilmezse hata vermez", () => {
        const execute = (): number => 1;

        expect(() => defineAlways(execute)).not.toThrow();
        expect(() => defineAlways({ execute })).not.toThrow();

        const task = defineAlways(execute);

        // `undefined` olmali: loader config degerine duser.
        expect(task.interval).toBeUndefined();
        expect(task.runOnStart).toBeUndefined();
        expect(task.name).toBeUndefined();
    });

    it("name alanini korur", () => {
        const task = defineAlways({
            name: "periyodik-rapor",
            interval: 30_000,
            execute: () => 1
        });

        expect(task.name).toBe("periyodik-rapor");
        expect(task.interval).toBe(30_000);
    });
});

describe("missingPackage", () => {
    it("MODULE_NOT_FOUND hatasindan paket adini cikarir", () => {
        const error: NodeJS.ErrnoException = new Error(
            "Cannot find module 'dissora'"
        );
        error.code = "MODULE_NOT_FOUND";

        expect(missingPackage(error)).toBe("dissora");
    });

    it("diger hatalarda null doner", () => {
        expect(missingPackage(new Error("patladi"))).toBeNull();
        expect(missingPackage("patladi")).toBeNull();
    });
});

describe("loadModuleFile", () => {
    it("eksik pakette npm install ipucu verir", () => {
        const file = join(root, "eksik.js");
        writeFileSync(file, 'require("dissora-eksik-paket");\n', "utf8");

        expect(() => loadModuleFile(file)).toThrow(
            /dissora-eksik-paket bulunamadi.*npm install/s
        );
    });

    it("cozulebilen hatayi oldugu gibi firlatir", () => {
        const file = join(root, "patla.js");
        writeFileSync(file, 'throw new Error("kendi hatam");\n', "utf8");

        expect(() => loadModuleFile(file)).toThrow(/kendi hatam/);
    });
});
