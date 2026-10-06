import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProject } from "../src/cli/create.js";
import { packageVersion } from "../src/utils/root.js";

const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");

/** Gercek `writeFileSync` cagrisini oldugu gibi iletir. */
function realWrite(...args: unknown[]): boolean {
    const write = realFs.writeFileSync as unknown as (
        ...inner: unknown[]
    ) => boolean;

    return write(...args);
}

/** Tek bir yazma cagrisini bozabilen mock; varsayilaninda gercek davranir. */
const fsMock = vi.fn((...args: unknown[]) => realWrite(...args));

vi.mock("node:fs", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");

    return {
        ...actual,
        writeFileSync: (...args: unknown[]) => fsMock(...args)
    };
});

let root: string;

function readJson(path: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dissora-create-"));
});

afterEach(() => {
    fsMock.mockReset();
    fsMock.mockImplementation((...args: unknown[]) => realWrite(...args));
    rmSync(root, { recursive: true, force: true });
});

describe("createProject - JS sablonu", () => {
    it("calisma icin hazir dosyalari uretir", async () => {
        const target = await createProject({
            projectPath: root,
            name: "botum",
            typescript: false
        });

        for (const file of [
            "package.json",
            ".env",
            ".gitignore",
            "README.md",
            "index.js",
            "BotConfig.json"
        ]) {
            expect(existsSync(join(target, file))).toBe(true);
        }

        const pkg = readJson(join(target, "package.json")) as {
            name: string;
            type: string;
            dissora: { template: string };
        };

        expect(pkg.name).toBe("botum");
        expect(pkg.type).toBe("commonjs");
        expect(pkg.dissora.template).toBe("js");
    });

    it("dissora surumunu calisan CLI surumune yazar", async () => {
        const target = await createProject({
            projectPath: root,
            name: "botum",
            typescript: false
        });

        const pkg = readJson(join(target, "package.json")) as {
            dependencies: Record<string, string>;
        };

        // Sablonda sabit `^1.0.0` yaziyordu; CLI surumu farkliysa proje
        // uyumsuz bir framework ile kurulurdu.
        expect(pkg.dependencies.dissora).toBe(`^${packageVersion()}`);
    });

    it("README'de dogru modul komutu yazar", async () => {
        const target = await createProject({
            projectPath: root,
            name: "botum",
            typescript: false
        });

        const readme = readFileSync(join(target, "README.md"), "utf8");

        expect(readme).toContain("dissora module create");
        expect(readme).not.toContain("dissora create Modules/");
    });
});

describe("createProject - TS sablonu", () => {
    it("index.ts ve tsconfig uretir", async () => {
        const target = await createProject({
            projectPath: root,
            name: "botts",
            typescript: true
        });

        expect(existsSync(join(target, "index.ts"))).toBe(true);
        expect(existsSync(join(target, "tsconfig.json"))).toBe(true);
        expect(existsSync(join(target, "index.js"))).toBe(false);

        const pkg = readJson(join(target, "package.json")) as {
            dissora: { template: string };
            devDependencies: Record<string, string>;
            dependencies: Record<string, string>;
        };

        expect(pkg.dissora.template).toBe("ts");
        expect(pkg.dependencies.dissora).toBe(`^${packageVersion()}`);
        expect(Object.keys(pkg.devDependencies)).toContain("typescript");
    });
});

describe("createProject - hata durumlari", () => {
    it("var olan klasoru ezmez", async () => {
        await createProject({
            projectPath: root,
            name: "botum",
            typescript: false
        });

        await expect(
            createProject({
                projectPath: root,
                name: "botum",
                typescript: false
            })
        ).rejects.toThrow(/zaten var/);
    });

    it("guvenli olmayan adi reddeder ve klasor olusturmaz", async () => {
        await expect(
            createProject({
                projectPath: root,
                name: "../kacis",
                typescript: false
            })
        ).rejects.toThrow(/Gecersiz/);

        expect(existsSync(join(root, "..", "kacis"))).toBe(false);
    });

    it("yarim kurulum birakmaz", async () => {
        // Kopyalama basarili olsun ama `.env` yazimi patlasin: hedef
        // klasor tamamen temizlenmezse kullanici ayni adla tekrar
        // olusturamaz.
        fsMock.mockImplementationOnce((...args: unknown[]) => {
            if (String(args[0]).endsWith(".env")) {
                throw new Error("disk doldu");
            }

            return realWrite(...args);
        });

        await expect(
            createProject({
                projectPath: root,
                name: "yarim",
                typescript: false
            })
        ).rejects.toThrow(/disk doldu/);

        // Yarim klasor birakilmadi.
        expect(existsSync(join(root, "yarim"))).toBe(false);

        // Ayni ad tekrar kullanilabiliyor.
        await expect(
            createProject({
                projectPath: root,
                name: "yarim",
                typescript: false
            })
        ).resolves.toBeTruthy();
    });
});
