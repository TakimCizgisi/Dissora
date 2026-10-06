import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    createModule,
    detectProjectTypescript
} from "../src/cli/create-module.js";
import { parseModuleConfig } from "../src/config/module-config.js";
import { resolveModulePlan } from "../src/core/DependencyResolver.js";
import { collectModuleCandidates } from "../src/core/ModuleHost.js";
import { ProjectPaths } from "../src/services/Paths.js";
import { unwrapDefault } from "../src/utils/load-module.js";

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dissora-mod-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("unwrapDefault", () => {
    it("__esModule isaretli default sarmalayicisini acar", () => {
        const inner = { execute: () => 1 };

        expect(
            unwrapDefault({ __esModule: true, default: inner, other: 1 })
        ).toBe(inner);
    });

    it("düz CommonJS ciktisini degistirmez", () => {
        const plain = { execute: () => 1 };

        expect(unwrapDefault(plain)).toBe(plain);
    });

    it("isaretsiz default alanina dokunmaz", () => {
        const obj = { default: 1 };

        expect(unwrapDefault(obj)).toBe(obj);
    });

    it("ilkel degerleri oldugu gibi birakir", () => {
        const fn = (): number => 1;

        expect(unwrapDefault(fn)).toBe(fn);
        expect(unwrapDefault(null)).toBeNull();
        expect(unwrapDefault(7)).toBe(7);
    });
});

describe("createModule", () => {
    it("yalnizca modul dosyalarini uretir", async () => {
        const target = await createModule({
            modulesDir: root,
            name: "Economy",
            typescript: false
        });

        expect(target).toBe(join(root, "Economy"));
        expect(parseModuleConfig(readJson("Economy")).name).toBe("Economy");
        expect(exists(join(target, "index.js"))).toBe(true);
        expect(exists(join(target, "Command", "ornek.js"))).toBe(true);
        expect(exists(join(target, "Event", "ready.js"))).toBe(true);
        expect(exists(join(target, ".env"))).toBe(false);
        expect(exists(join(target, "BotConfig.json"))).toBe(false);
        expect(exists(join(target, "package.json"))).toBe(false);
    });

    it("proje sablonu karismaz", async () => {
        const target = await createModule({
            modulesDir: root,
            name: "Test",
            typescript: true
        });

        expect(exists(join(target, "package.json"))).toBe(false);
        expect(exists(join(target, "BotConfig.json"))).toBe(false);
        expect(exists(join(target, "index.ts"))).toBe(true);
        expect(exists(join(target, "Modules"))).toBe(false);
    });

    it("requires degerlerini moduleconfig.json'a yazar", async () => {
        await createModule({
            modulesDir: root,
            name: "Zenginlik",
            typescript: false,
            requires: ["Ekonomi", "Log"]
        });

        expect(readJson("Zenginlik").requires).toEqual(["Ekonomi", "Log"]);
    });

    it("uretilen modul aday olarak okunur", async () => {
        await createModule({
            modulesDir: join(root, "Modules"),
            name: "Ornek",
            typescript: false
        });

        const paths = new ProjectPaths(root);
        const candidates = collectModuleCandidates(
            paths,
            join(root, "Modules"),
            "Modules"
        );
        const plan = resolveModulePlan(candidates);

        expect(plan.errors).toEqual([]);
        expect(plan.order.map(entry => entry.name)).toEqual(["Ornek"]);
    });

    it("bayrak verilmezse projeden dil tahmin eder", async () => {
        const modulesDir = join(root, "Modules");
        await createModule({ modulesDir, name: "Once", typescript: true });
        await createModule({ modulesDir, name: "Sonra", typescript: null });

        expect(exists(join(modulesDir, "Sonra", "index.ts"))).toBe(true);
        expect(exists(join(modulesDir, "Sonra", "Command", "ornek.ts"))).toBe(
            true
        );
        expect(readJson("Sonra", modulesDir).main).toBe("index.ts");
    });

    it("TS modulunde event dosyasi .ts olarak isaretlenir", async () => {
        await createModule({
            modulesDir: join(root, "Modules"),
            name: "Ts",
            typescript: true
        });

        const config = readJson("Ts", join(root, "Modules"));
        const files = (
            config.events as { files: Array<{ event: string; file: string }> }
        ).files;

        expect(config.main).toBe("index.ts");
        expect(files[0]).toEqual({ event: "ready", file: "Event/ready.ts" });
        expect(exists(join(root, "Modules", "Ts", "Event", "ready.ts"))).toBe(
            true
        );
    });

    it("TS modulu isimlendirilmis export kullanir", async () => {
        const target = await createModule({
            modulesDir: root,
            name: "Export",
            typescript: true
        });

        const index = readFileSync(join(target, "index.ts"), "utf8");

        expect(index).toContain("export function init");
        expect(index).toContain("export function start");
        expect(index).not.toContain("export default");
    });

    // Regresyon: uretilen event sablonu `execute: async context =>`
    // yaziyordu. Event dinleyicileri ModuleContext **almaz**; dogrudan
    // discord.js argumanlarini alir. `context.log` calisma zamaninda
    // `undefined` idi ve tip denetimi de kirardi.
    it("TS event sablonu ModuleContext kullanmaz", async () => {
        const target = await createModule({
            modulesDir: root,
            name: "Evt",
            typescript: true
        });

        const event = readFileSync(join(target, "Event", "ready.ts"), "utf8");

        expect(event).toContain('defineEvent("ready"');
        expect(event).not.toContain("context.log");
        expect(event).not.toContain("execute: async context");
    });

    it("JS event sablonu ModuleContext kullanmaz", async () => {
        const target = await createModule({
            modulesDir: root,
            name: "EvtJs",
            typescript: false
        });

        const event = readFileSync(join(target, "Event", "ready.js"), "utf8");

        expect(event).toContain('defineEvent("ready"');
        expect(event).not.toContain("context.log");
        expect(event).not.toContain("execute: async context");
    });

    it("JS projesinde dil tahmini JS verir", async () => {
        const modulesDir = join(root, "Modules");
        await createModule({ modulesDir, name: "Once", typescript: false });
        await createModule({ modulesDir, name: "Sonra", typescript: null });

        expect(exists(join(modulesDir, "Sonra", "index.js"))).toBe(true);
        expect(readJson("Sonra", modulesDir).main).toBe("index.js");
    });

    it("tsconfig.json yoksa JS varsayilir", async () => {
        expect(detectProjectTypescript(join(root, "yok"))).toBe(false);
    });

    it("guvenli olmayan adi reddeder", async () => {
        await expect(
            createModule({
                modulesDir: root,
                name: "../kacis",
                typescript: false
            })
        ).rejects.toThrow(/Gecersiz modul adi/);
    });

    it("var olan klasoru ezmez", async () => {
        await createModule({ modulesDir: root, name: "A", typescript: false });

        await expect(
            createModule({ modulesDir: root, name: "A", typescript: false })
        ).rejects.toThrow(/zaten var/);
    });

    it("kendine baglanmayi engeller", async () => {
        await expect(
            createModule({
                modulesDir: root,
                name: "A",
                typescript: false,
                requires: ["A"]
            })
        ).rejects.toThrow(/kendine bagli olamaz/);
    });

    it("olmayan bagimlilik hatasi vermez, bot calisir", async () => {
        await createModule({
            modulesDir: join(root, "Modules"),
            name: "A",
            typescript: false,
            requires: ["Yok"]
        });

        const paths = new ProjectPaths(root);
        const plan = resolveModulePlan(
            collectModuleCandidates(paths, join(root, "Modules"), "Modules")
        );

        expect(plan.errors[0]?.name).toBe("A");
    });
});

function readJson(
    moduleName: string,
    modulesDir = root
): Record<string, unknown> {
    return JSON.parse(
        readFileSync(join(modulesDir, moduleName, "moduleconfig.json"), "utf8")
    ) as Record<string, unknown>;
}

function exists(file: string): boolean {
    return existsSync(file);
}
