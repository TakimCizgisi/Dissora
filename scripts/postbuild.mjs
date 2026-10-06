import { access, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const markers = [
    { dir: "dist/cjs", type: "commonjs" },
    { dir: "dist/esm", type: "module" }
];

const required = [
    "dist/cjs/index.js",
    "dist/cjs/bin/dissora.js",
    "dist/esm/index.js",
    "dist/esm/bin/dissora.js",
    "dist/types/index.d.ts"
];

/**
 * Sablonlar derlenmez; paket icinde `src/templates` olarak tasinir.
 * Eksik paketlenirse `dissora create` kullanici tarafinda, uzakta
 * ve hatasi zor anlasilir sekilde patlar. Burada erken yakalayalim.
 */
const requiredTemplates = [
    "src/templates/js/package.json",
    "src/templates/js/index.js",
    "src/templates/js/BotConfig.json",
    "src/templates/js/Modules/Ornek/moduleconfig.json",
    "src/templates/ts/package.json",
    "src/templates/ts/tsconfig.json",
    "src/templates/ts/index.ts",
    "src/templates/ts/Modules/Ornek/moduleconfig.json"
];

for (const { dir, type } of markers) {
    const file = resolve(root, dir, "package.json");
    await writeFile(file, `${JSON.stringify({ type }, null, 4)}\n`, "utf8");
    process.stdout.write(
        `[postbuild] ${dir}/package.json -> { "type": "${type}" }\n`
    );
}

const missing = [];

for (const entry of [...required, ...requiredTemplates]) {
    try {
        await access(resolve(root, entry));
    } catch {
        missing.push(entry);
    }
}

if (missing.length > 0) {
    process.stderr.write(
        `[postbuild] eksik ciktilar:\n${missing.map(m => `  - ${m}`).join("\n")}\n`
    );
    process.exit(1);
}

process.stdout.write(
    `[postbuild] dual build dogrulandi (cjs + esm + types)` +
        `, ${requiredTemplates.length} sablon yerinde\n`
);
