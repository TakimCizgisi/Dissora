import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `npm link` ile global baglanti kurar ve **dogrular**.
 *
 * Yalnizca `npm link` ciktisina bakmak yetersizdir: npm bazi hatalarda
 * sifir doner. Bu yuzden global shim gercekten calistirilir; "baglandi"
 * mesaji ancak `dissora --version` gercekten surumu yazdirirsa cikar.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const link = spawnSync("npm", ["link"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
});

if (link.error) {
    process.stderr.write(`[link] hata: ${link.error.message}\n`);
    process.exit(1);
}

if (link.status !== 0) {
    process.stderr.write(
        `[link] npm link basarisiz (cikis kodu ${link.status ?? "?"}).\n`
    );
    process.exit(link.status ?? 1);
}

const check = spawnSync("dissora", ["--version"], {
    stdio: "inherit",
    shell: process.platform === "win32"
});

if (check.error) {
    process.stderr.write(`[link] dogrulama hatasi: ${check.error.message}\n`);
    process.exit(1);
}

if (check.status !== 0) {
    process.stderr.write(
        [
            `[link] npm link calisti ama "dissora --version" ` +
                `basarisiz oldu (cikis kodu ${check.status ?? "?"}).`,
            "PATH ayarlarinizi kontrol edin.",
            ""
        ].join("\n")
    );
    process.exit(check.status ?? 1);
}

process.stdout.write(
    [
        "",
        "[link] dissora global olarak baglandi ve dogrulandi.",
        "",
        "Diger komutlar:",
        "  dissora --help",
        "  dissora create <proje>",
        "  dissora module create <ad>",
        ""
    ].join("\n")
);
