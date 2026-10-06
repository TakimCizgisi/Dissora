import { execFileSync, spawnSync } from "node:child_process";
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { packageRoot, packageVersion } from "../src/utils/root.js";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const shim = join(root, "bin", "dissora.js");

describe("paket koku", () => {
    it("DISSORA_ROOT uzerinden cozulur", () => {
        expect(packageRoot()).toBe(root);
    });

    it("paket surumunu dondurur", () => {
        expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+/);
    });
});

describe("bin shim", () => {
    // Bu testler `node` alt sureci baslatir ve butun CLI'yi yukler.
    // Vitest dosyalari paralel calistirdigi icin makine yogunlugunda
    // 5 saniyelik varsayilan asilabiliyor; bilerek genis tutulur.
    const SPAWN_TIMEOUT = 60_000;

    it("build yoksa anlasilir hata verir", { timeout: SPAWN_TIMEOUT }, () => {
        const dir = mkdtempSync(join(tmpdir(), "dissora-shim-"));

        try {
            writeFileSync(
                join(dir, "dissora.js"),
                readFileSync(shim, "utf8"),
                "utf8"
            );

            const result = spawnSync(
                process.execPath,
                [join(dir, "dissora.js")],
                { encoding: "utf8", timeout: SPAWN_TIMEOUT }
            );

            expect(result.status).toBe(1);
            expect(result.stderr).toMatch(/derlenmis cikti bulunamadi/);
            expect(result.stderr).toMatch(/npm run build/);
            // Kullaniciya yigin izi (stack) gosterilmemeli.
            expect(result.stderr).not.toMatch(/at Object\./);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("build varsa CLI calisir", { timeout: SPAWN_TIMEOUT }, () => {
        const distEntry = join(root, "dist", "cjs", "bin", "dissora.js");

        // `dist/` kaynakta degilse (silinmis ya da surum bump'i sonrasi
        // bayat kalmis) test yine de anlamli kalsin diye once taze
        // derleme yapilir.
        const readBuiltVersion = (): string | null => {
            if (!existsSync(distEntry)) {
                return null;
            }

            try {
                return execFileSync(process.execPath, [shim, "--version"], {
                    encoding: "utf8",
                    timeout: SPAWN_TIMEOUT
                }).trim();
            } catch {
                return null;
            }
        };

        let built = readBuiltVersion();

        if (built !== packageVersion()) {
            execFileSync("npm", ["run", "build"], {
                cwd: root,
                stdio: "ignore",
                timeout: SPAWN_TIMEOUT
            });

            built = readBuiltVersion();
        }

        expect(built).toBe(packageVersion());
    });
});
