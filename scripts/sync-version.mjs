import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `src/version.ts` ile `package.json` surumunun ayni oldugunu **dogrular**.
 *
 * Uretimde kaynak dosyayi yeniden yazmak yanlislik kapiyi acar:
 * `npm version` sonrasi unutulmus bir `src/version.ts` paketi sessizce
 * eski surumle yayinlar. Bu yuzden dosya elle senkron tutulur ve burada
 * yalnizca tutarlilik denetlenir.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "src", "version.ts");

const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const expected = [
    "/**",
    " * Bu dosya `scripts/sync-version.mjs` ile `package.json` surumuyle",
    " * senkron tutulur. Elle degistirme; surumu package.json yonetir.",
    " */",
    "",
    `export const VERSION = "${pkg.version}";`,
    ""
].join("\n");

let current;

try {
    current = await readFile(target, "utf8");
} catch (error) {
    process.stderr.write(
        `[version] src/version.ts okunamadi (${error.message}).\n` +
            `[version] olusturuluyor...\n`
    );
    await writeFile(target, expected, "utf8");
    process.stdout.write(
        `[version] src/version.ts uretildi -> ${pkg.version}\n`
    );
    process.exit(0);
}

const forceWrite = process.argv.slice(2).includes("--write");

if (current !== expected) {
    if (forceWrite) {
        await writeFile(target, expected, "utf8");
        process.stdout.write(
            `[version] src/version.ts yazildi -> ${pkg.version}\n`
        );
        process.exit(0);
    }

    process.stderr.write(
        [
            `[version] src/version.ts package.json ile eslesmiyor.`,
            ``,
            `  package.json : ${pkg.version}`,
            ``,
            "Duzeltmek icin:",
            "  node scripts/sync-version.mjs --write",
            ""
        ].join("\n")
    );
    process.exit(1);
}

process.stdout.write(
    `[version] src/version.ts -> ${pkg.version} (dogrulandi)\n`
);
