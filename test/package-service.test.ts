import { spawnSync } from "node:child_process";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    assertSafeSpec,
    installInto,
    NpmError,
    npm,
    specArgsOf,
    viewPackage
} from "../src/services/PackageService.js";

describe("assertSafeSpec", () => {
    it("yerel tarball yolunu kabul eder", () => {
        expect(() =>
            assertSafeSpec("C:\\Users\\test\\ornek-modul-1.0.0.tgz")
        ).not.toThrow();
        expect(() => assertSafeSpec("./paketler/modul.tgz")).not.toThrow();
        expect(() => assertSafeSpec("file:./paketler/modul.tgz")).not.toThrow();
        expect(() => assertSafeSpec("modul.tar.gz")).not.toThrow();
        // Bosluk sorun degildir; quoteForCmd degerleri tirnaklar.
        expect(() =>
            assertSafeSpec("C:\\Program Files\\modul.tgz")
        ).not.toThrow();
    });

    it("tarball yolunda cmd meta karakterlerini reddeder", () => {
        expect(() => assertSafeSpec("%USERPROFILE%\\modul.tgz")).toThrow();
        expect(() => assertSafeSpec("modul.tgz & calc.exe")).toThrow();
        expect(() => assertSafeSpec("modul.tgz | calc.exe")).toThrow();
        expect(() => assertSafeSpec("modul.tgz > cikti.txt")).toThrow();
        expect(() => assertSafeSpec("modul.tgz ^ & calc")).toThrow();
        expect(() => assertSafeSpec('modul".tgz')).toThrow();
        expect(() => assertSafeSpec("modul.tgz !var!")).toThrow();
    });

    it("tarball disi yollari kabul etmez", () => {
        expect(() => assertSafeSpec("C:\\Users\\test\\klasor")).toThrow();
        expect(() => assertSafeSpec("./index.js")).toThrow();
    });

    it("duz paket adini kabul eder", () => {
        expect(() => assertSafeSpec("discord.js")).not.toThrow();
        expect(() => assertSafeSpec("@dissora/economy")).not.toThrow();
    });

    it("surum belirtimini kabul eder", () => {
        expect(() => assertSafeSpec("discord.js@14.16.3")).not.toThrow();
        expect(() => assertSafeSpec("@dissora/economy@^1.2.0")).not.toThrow();
        expect(() => assertSafeSpec("pkg@next")).not.toThrow();
    });

    it("github belirtimini kabul eder", () => {
        expect(() => assertSafeSpec("github:user/repo")).not.toThrow();
        expect(() => assertSafeSpec("github:user/repo#v1.0.0")).not.toThrow();
    });

    it("shell enjeksiyon denemesini reddeder", () => {
        const attacks = [
            "discord.js & calc",
            "discord.js; calc",
            "discord.js | calc",
            "discord.js && echo",
            "$(calc)",
            "discord.js`whoami`",
            "discord.js & del /f important.txt"
        ];

        for (const attack of attacks) {
            expect(() => assertSafeSpec(attack)).toThrow(/Gecersiz paket/);
        }
    });

    it("yeni satir ve noktali zincir reddeder", () => {
        expect(() => assertSafeSpec("discord.js\ncalc")).toThrow();
        expect(() => assertSafeSpec("discord.js > out.txt")).toThrow();
        expect(() => assertSafeSpec(">out")).toThrow();
    });
});

describe("viewPackage - yerel tarball", () => {
    const workspace = mkdtempSync(join(tmpdir(), "dissora-viewtest-"));

    // afterEach calisiyor; testlerin kendisi klasoru yeniden kurmadan
    // dosya yazabilsin.
    beforeEach(() => {
        mkdirSync(workspace, { recursive: true });
    });

    afterEach(() => {
        rmSync(workspace, { recursive: true, force: true });
    });

    /** Gecici bir modul tarball'i uretir. */
    function pack(name: string, version: string): string {
        const src = join(workspace, "kaynak");

        mkdirSync(src, { recursive: true });
        writeFileSync(
            join(src, "package.json"),
            `${JSON.stringify({ name, version, description: "test" })}\n`,
            "utf8"
        );
        writeFileSync(join(src, "moduleconfig.json"), "{}\n", "utf8");

        const result = spawnSync(
            "npm",
            ["pack", "--pack-destination", workspace],
            {
                cwd: src,
                encoding: "utf8",
                // Windows'ta `npm` bir `.cmd` betigidir; shell'siz spawn
                // reddedilir (EINVAL).
                shell: process.platform === "win32"
            }
        );

        expect(result.status, result.stderr).toBe(0);

        const packed = readdirSync(workspace).find(entry =>
            entry.endsWith(".tgz")
        );

        expect(packed).toBeDefined();

        return join(workspace, packed as string);
    }

    it("tarball adini ve surumunu okur", { timeout: 120_000 }, async () => {
        const tgz = pack("@ornek/kaynak", "2.3.4");
        const info = await viewPackage(tgz, workspace);

        expect(info.name).toBe("@ornek/kaynak");
        expect(info.version).toBe("2.3.4");
        expect(info.description).toBe("test");
    });

    it("file: onekini kabul eder", { timeout: 120_000 }, async () => {
        const tgz = pack("kapsamsiz", "1.0.0");
        const info = await viewPackage(`file:${tgz}`, workspace);

        expect(info.name).toBe("kapsamsiz");
    });

    it("goreli yolu proje kokune gore cozer", {
        timeout: 120_000
    }, async () => {
        const tgz = pack("goreli", "0.1.0");
        const base = basename(tgz);

        // Ayni dosyayi "./" ile adlandirilmis kopyasiyla sun.
        const renamed = join(workspace, "yeniden-adlandirilmis.tgz");

        copyFileSync(tgz, renamed);
        expect(base).not.toBe("yeniden-adlandirilmis.tgz");

        const info = await viewPackage(
            "./yeniden-adlandirilmis.tgz",
            workspace
        );

        expect(info.name).toBe("goreli");
        expect(info.version).toBe("0.1.0");
    });

    it("olmayan tarball icin E404 degil anlasilir hata verir", {
        timeout: 120_000
    }, async () => {
        await expect(viewPackage("./olmayan.tgz", workspace)).rejects.toThrow(
            /npm error|ENOENT|not found|bulunamadi/i
        );
    });

    it("bozuk gzip dosyasini anlasilir sekilde reddeder", async () => {
        const broken = join(workspace, "bozuk.tgz");

        // Gercek bir tarball'in yarisi: gzip akisi yarida kesilmis.
        writeFileSync(
            broken,
            readFileSync(pack("bozuk-kaynak", "1.0.0")).subarray(0, 25)
        );

        await expect(viewPackage(broken, workspace)).rejects.toThrow(
            /gecersiz gzip|okunamadi/i
        );
    });

    it("package.json icermeyen arsivi reddeder", async () => {
        const empty = join(workspace, "package.json'suz.tgz");

        // npm, package.json'siz bir klasoru paketleyemedigi icin tar
        // elle uretilir: yalnizca `package/moduleconfig.json` icerir.
        const content = Buffer.from("{}\n", "utf8");
        const header = Buffer.alloc(512);

        header.write("package/moduleconfig.json", 0, "utf8");
        header.write("0000644\0", 100, "utf8");
        header.write(
            `${content.length.toString(8).padStart(11, "0")}\0`,
            124,
            "utf8"
        );
        header.write("00000000000\0", 136, "utf8");
        header.write("        ", 148, "utf8");
        header.write("0", 156, "utf8");
        header.write("ustar\0", 257, "utf8");
        header.write("00", 263, "utf8");
        writeFileSync(
            empty,
            gzipSync(Buffer.concat([header, content, Buffer.alloc(1024)]))
        );

        await expect(viewPackage(empty, workspace)).rejects.toThrow(
            /package\/package\.json bulunamadi/
        );
    });

    it("name alani olmayan manifesti reddeder", async () => {
        const content = Buffer.from('{"version":"1.0.0"}', "utf8");
        const header = Buffer.alloc(512);

        header.write("package/package.json", 0, "utf8");
        header.write(
            `${content.length.toString(8).padStart(11, "0")}\0`,
            124,
            "utf8"
        );
        header.write("00000000000\0", 136, "utf8");
        header.write("0000644\0", 100, "utf8");
        header.write("0", 156, "utf8");
        header.write("ustar\0", 257, "utf8");

        const file = join(workspace, "isimsiz.tgz");

        writeFileSync(
            file,
            gzipSync(Buffer.concat([header, content, Buffer.alloc(1024)]))
        );

        await expect(viewPackage(file, workspace)).rejects.toThrow(
            /name alani yok/
        );
    });

    it("UTF-8 BOM'lu package.json'i kabul eder", async () => {
        // Windows PowerShell 5.1 `Set-Content -Encoding UTF8` BOM ekler.
        const content = Buffer.concat([
            Buffer.from([0xef, 0xbb, 0xbf]),
            Buffer.from('{"name":"bomlu","version":"3.0.0"}', "utf8")
        ]);
        const header = Buffer.alloc(512);

        header.write("package/package.json", 0, "utf8");
        header.write(
            `${content.length.toString(8).padStart(11, "0")}\0`,
            124,
            "utf8"
        );
        header.write("00000000000\0", 136, "utf8");
        header.write("0000644\0", 100, "utf8");
        header.write("0", 156, "utf8");
        header.write("ustar\0", 257, "utf8");

        const file = join(workspace, "bomlu.tgz");

        writeFileSync(
            file,
            gzipSync(Buffer.concat([header, content, Buffer.alloc(1024)]))
        );

        const info = await viewPackage(file, workspace);

        expect(info.name).toBe("bomlu");
        expect(info.version).toBe("3.0.0");
    });
});

describe("specArgsOf", () => {
    it("secenek degerlerini paket belirtimi saymaz", () => {
        // `--prefix` degeri bir klasor yoludur; onceki kod bunu da
        // dogruluyor ve her kurulumu "Gecersiz paket belirtimi" ile
        // dusuruyordu.
        expect(
            specArgsOf([
                "install",
                "./modul.tgz",
                "--prefix",
                "C:\\Users\\test\\Temp\\dissora-abc",
                "--no-save"
            ])
        ).toEqual(["install", "./modul.tgz"]);
    });

    it("--prefix=... bicimini de tanir", () => {
        expect(
            specArgsOf(["view", "--prefix=C:\\Temp\\x", "discord.js"])
        ).toEqual(["view", "discord.js"]);
    });

    it("kisa bayrak degerlerini de atlar", () => {
        expect(specArgsOf(["install", "-w", "paket-adi", "paket"])).toEqual([
            "install",
            "paket"
        ]);
    });
});

describe("installInto", () => {
    it("yerel tarball'i gecici klasore kurar", {
        timeout: 120_000
    }, async () => {
        const workspace = mkdtempSync(join(tmpdir(), "dissora-install-"));
        const target = join(workspace, "hedef");

        mkdirSync(join(workspace, "kaynak"), { recursive: true });
        writeFileSync(
            join(workspace, "kaynak", "package.json"),
            '{"name":"kurulacak","version":"1.2.3"}\n',
            "utf8"
        );

        const packed = spawnSync(
            "npm",
            ["pack", "--pack-destination", workspace],
            {
                cwd: join(workspace, "kaynak"),
                encoding: "utf8",
                shell: process.platform === "win32"
            }
        );

        expect(packed.status, packed.stderr).toBe(0);

        const file = readdirSync(workspace).find(entry =>
            entry.endsWith(".tgz")
        ) as string;

        await installInto(join(workspace, file), target, workspace);

        const installed = join(
            target,
            "node_modules",
            "kurulacak",
            "package.json"
        );

        expect(existsSync(installed)).toBe(true);
        expect(JSON.parse(readFileSync(installed, "utf8")).version).toBe(
            "1.2.3"
        );

        rmSync(workspace, { recursive: true, force: true });
    });
});

describe("npm", () => {
    it("gecersiz spec ile npm'e hic gitmez", async () => {
        await expect(
            npm(["view", "discord.js & calc"], process.cwd())
        ).rejects.toThrow(/Gecersiz paket/);
    });

    it("bayraklari dogrular", async () => {
        // "--json" gibi bayraklar spec kontrolunden gecer.
        const result = await npm(
            ["view", "discord.js", "version", "--json"],
            process.cwd(),
            120_000
        );

        expect(result.stdout.trim().length).toBeGreaterThan(0);
    });

    it("npm hatasinda anlamli mesaj ve kodu korur", async () => {
        let thrown: unknown;

        try {
            await npm(
                ["view", "@dissora/olmayan-paket-xyz-123", "version"],
                process.cwd(),
                120_000
            );
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(NpmError);

        const failure = thrown as NpmError;

        // "Command failed: npm.cmd view ..." degil, npm'in gercek hatasi.
        expect(failure.message).not.toMatch(/Command failed/);
        expect(failure.stderr).not.toBe("");
        expect(failure.code).not.toBeNull();
    });
});
