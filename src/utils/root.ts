/**
 * Paket kokunun konumu.
 *
 * Hem CJS hem ESM derlemesinde calismasi gerektigi icin `import.meta`
 * kullanilmaz. `bin/dissora.js` shimi `DISSORA_ROOT` degerini doldurur;
 * yoksa burada guvenli bir yedek arama yapilir.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { readJsonFile } from "./fs.js";

const PACKAGE_NAME = "dissora";

function readPackageName(dir: string): string | null {
    const file = join(dir, "package.json");

    if (!existsSync(file)) {
        return null;
    }

    try {
        const raw: unknown = readJsonFile(file);

        if (raw && typeof raw === "object" && "name" in raw) {
            const name = (raw as { name?: unknown }).name;

            return typeof name === "string" ? name : null;
        }
    } catch {
        return null;
    }

    return null;
}

function walkUp(from: string, accept: (dir: string) => boolean): string | null {
    let current = resolve(from);

    for (let depth = 0; depth < 12; depth++) {
        if (accept(current)) {
            return current;
        }

        const parent = dirname(current);

        if (parent === current) {
            return null;
        }

        current = parent;
    }

    return null;
}

/**
 * `dist/`, `node_modules/dissora/` veya kaynak agacinin kokunu dondurur.
 *
 * Cozulemezse calisma dizini kullanilir; sablon kopyalama o durumda
 * anlasilir bir hata firlatir.
 */
export function packageRoot(): string {
    const fromEnv = process.env.DISSORA_ROOT;

    if (fromEnv !== undefined && fromEnv !== "") {
        return resolve(fromEnv);
    }

    const fromNodeModules = walkUp(process.cwd(), dir =>
        existsSync(join(dir, "node_modules", PACKAGE_NAME, "package.json"))
    );

    if (fromNodeModules !== null) {
        return join(fromNodeModules, "node_modules", PACKAGE_NAME);
    }

    const own = walkUp(
        process.cwd(),
        dir => readPackageName(dir) === PACKAGE_NAME
    );

    if (own !== null) {
        return own;
    }

    const withTemplates = walkUp(process.cwd(), dir =>
        existsSync(join(dir, "src", "templates"))
    );

    return withTemplates ?? resolve(process.cwd());
}

/** `dissora` paketinin surumunden gelen semantik surum. */
export function packageVersion(): string {
    const file = join(packageRoot(), "package.json");

    if (!existsSync(file)) {
        return "0.0.0";
    }

    const name = readPackageName(dirname(file));

    if (name === null) {
        return "0.0.0";
    }

    try {
        const raw: unknown = readJsonFile(file);
        const version =
            raw && typeof raw === "object"
                ? (raw as { version?: unknown }).version
                : null;

        return typeof version === "string" ? version : "0.0.0";
    } catch {
        return "0.0.0";
    }
}
