import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    readModuleRecord,
    removeModuleFolder,
    replaceModuleFolder
} from "../src/services/Installer.js";

let root: string;
let source: string;
let target: string;

function write(path: string, content: string): void {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content, "utf8");
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dissora-install-"));
    source = join(root, "kaynak");
    target = join(root, "Modules", "Ekonomi");

    write(join(source, "index.js"), "yeni");
    write(join(source, "moduleconfig.json"), '{"name":"Ekonomi"}');
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("replaceModuleFolder", () => {
    it("yeni surumu kopyalar", () => {
        replaceModuleFolder(source, target);

        expect(existsSync(join(target, "index.js"))).toBe(true);
        expect(readFileSync(join(target, "index.js"), "utf8")).toBe("yeni");
    });

    it("var olan surumu degistirir ve yedegi siler", () => {
        write(join(target, "index.js"), "eski");
        write(join(target, "ekstra.js"), "eski-ekstra");

        replaceModuleFolder(source, target);

        expect(readFileSync(join(target, "index.js"), "utf8")).toBe("yeni");
        expect(existsSync(join(target, "ekstra.js"))).toBe(false);
        expect(existsSync(`${target}.dissora-backup`)).toBe(false);
    });

    it(".git ve yedek klasorlerini tasimaz", () => {
        write(join(source, ".git", "config"), "git");
        write(join(source, ".dissora-backup", "eski.txt"), "eski");

        replaceModuleFolder(source, target);

        expect(existsSync(join(target, ".git"))).toBe(false);
        expect(existsSync(join(target, ".dissora-backup"))).toBe(false);
    });

    it("afterCopy hatasi eski surumu geri yukler", () => {
        write(join(target, "index.js"), "eski");
        write(join(target, "korunacak.txt"), "eski-veri");

        expect(() =>
            replaceModuleFolder(source, target, () => {
                throw new Error("kayit yazilamadi");
            })
        ).toThrow(/kayit yazilamadi/);

        // Modul eski haline donmus olmali.
        expect(readFileSync(join(target, "index.js"), "utf8")).toBe("eski");
        expect(existsSync(join(target, "korunacak.txt"))).toBe(true);
        expect(existsSync(`${target}.dissora-backup`)).toBe(false);
    });

    it("yeni kurulumda afterCopy hatasi yarim klasor birakmaz", () => {
        expect(() =>
            replaceModuleFolder(source, target, () => {
                throw new Error("kayit yazilamadi");
            })
        ).toThrow();

        expect(existsSync(target)).toBe(false);
    });

    it("afterCopy basarisiz olsa bile eski kayit okunabilir", () => {
        write(
            join(target, ".dissora.json"),
            '{"package":"@a/b","version":"1.0.0","installedAt":"x","source":"@a/b"}'
        );
        write(join(target, "index.js"), "eski");

        expect(() =>
            replaceModuleFolder(source, target, () => {
                throw new Error("kayit yazilamadi");
            })
        ).toThrow();

        const record = readModuleRecord(root, "Ekonomi");

        expect(record?.package).toBe("@a/b");
        expect(record?.version).toBe("1.0.0");
    });
});

describe("removeModuleFolder", () => {
    it("klasoru ve kaydi siler", () => {
        write(join(target, "index.js"), "x");
        write(
            join(target, ".dissora.json"),
            '{"package":"@a/b","version":"1.0.0","installedAt":"x","source":"@a/b"}'
        );

        removeModuleFolder(root, "Ekonomi");

        expect(existsSync(target)).toBe(false);
        expect(readModuleRecord(root, "Ekonomi")).toBeNull();
    });

    it("olmayan modul icin hata firlatir", () => {
        expect(() => removeModuleFolder(root, "Yok")).toThrow(/bulunamadi/);
    });
});

describe("readModuleRecord", () => {
    it("eksik alanlari varsayilanlar ile tamamlar", () => {
        write(join(target, ".dissora.json"), '{"package":"@a/b"}');

        const record = readModuleRecord(root, "Ekonomi");

        expect(record).toEqual({
            package: "@a/b",
            version: "0.0.0",
            installedAt: "",
            source: "@a/b"
        });
    });

    it("bozuk JSON'da null doner", () => {
        write(join(target, ".dissora.json"), "bozuk {");

        expect(readModuleRecord(root, "Ekonomi")).toBeNull();
    });

    it("package alani yoksa null doner", () => {
        write(join(target, ".dissora.json"), '{"version":"1.0.0"}');

        expect(readModuleRecord(root, "Ekonomi")).toBeNull();
    });
});
