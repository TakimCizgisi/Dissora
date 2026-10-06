#!/usr/bin/env node
"use strict";

/**
 * Dissora CLI shim.
 *
 * Kaynak TypeScript'tir ve `npm run build` ile `dist/` altina derlenir.
 * Bu dosya yalnizca derlenmis CommonJS ciktisini yukler ve paket kokunu
 * `DISSORA_ROOT` ile bildirir; boylece sablonlar her iki build biciminde
 * de bulunabilir (ESM tarafinda `import.meta` kullanilamaz).
 */

const path = require("node:path");

if (!process.env.DISSORA_ROOT) {
    process.env.DISSORA_ROOT = path.resolve(__dirname, "..");
}

const entry = path.join(__dirname, "..", "dist", "cjs", "bin", "dissora.js");

if (!require("node:fs").existsSync(entry)) {
    process.stderr.write(
        [
            "dissora: derlenmis cikti bulunamadi.",
            "",
            `Beklenen: ${entry}`,
            "",
            "Paket kaynaktan kurulmus veya eksik paketlenmis olabilir.",
            "Duzeltmek icin:",
            "  npm run build     (kaynak agacinda)",
            "  npm install -g .  (yerel klasorden)",
            ""
        ].join("\n")
    );
    process.exit(1);
}

require(entry);
