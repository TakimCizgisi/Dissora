/**
 * Modul dosyalarini yukleme.
 *
 * `createRequire` tek basina `.ts` dosyalarini okuyamaz. TypeScript
 * projeleri `tsx index.ts` ile calistirildiginda hook zaten kayitlidir;
 * `dissora start` ile dogrudan calistirildiginda ise `tsx` / `ts-node`
 * require hook'u burada kaydedilir.
 *
 * Hook bulunamazsa anlasilir bir hata firlatilir; modul sessizce
 * atlanmaz.
 */

import { createRequire } from "node:module";
import { join } from "node:path";

import { scriptExtensionOf } from "./fs.js";

const TS_EXTENSIONS = [".ts", ".cts", ".mts"];

const HOOK_CANDIDATES = [
    "tsx/cjs",
    "ts-node/register/transpile-only",
    "ts-node/register"
];

let hookAttempted = false;

export function isTypeScriptFile(file: string): boolean {
    return TS_EXTENSIONS.includes(scriptExtensionOf(file));
}

/** Proje kokune gore cozumleme: kullaniciya ait `tsx` bulunsun. */
function projectRequire(): NodeRequire {
    return createRequire(join(process.cwd(), "__dissora_resolver__.js"));
}

function registerTypeScriptHook(): boolean {
    const require = projectRequire();

    for (const specifier of HOOK_CANDIDATES) {
        try {
            require(specifier);

            return true;
        } catch {
            // sonraki adayi dene
        }
    }

    return false;
}

/** Eksik paket adini `Cannot find module 'x'` mesajindan cikarir. */
export function missingPackage(error: unknown): string | null {
    if (
        !(error instanceof Error) ||
        (error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND"
    ) {
        return null;
    }

    return /Cannot find module '([^']+)'/.exec(error.message)?.[1] ?? null;
}

/**
 * Eksik paket hatasini cozulebilir bir ipucuyla degistirir.
 *
 * Projede `node_modules` yoksa modul dosyalari sessizce "Cannot find module
 * 'dissora'" yerine ne yapilmasi gerektigini soylemesi daha faydalidir.
 */
function withInstallHint(error: unknown): unknown {
    const pkg = missingPackage(error);

    if (pkg === null || error instanceof SyntaxError) {
        return error;
    }

    return new Error(
        `${pkg} bulunamadi. Proje klasorunde \`npm install\` calistir.`,
        { cause: error }
    );
}

/** Bir TypeScript require hook'unun kayitli olup olmadigini kontrol eder. */
function hasTypeScriptHook(require: NodeRequire): boolean {
    return Object.keys(require.extensions ?? {}).some(extension =>
        TS_EXTENSIONS.includes(extension)
    );
}

/**
 * Mutlak dosya yolunu yukler (`resolveScriptFile` ciktisi).
 *
 * `.ts` dosyalarinda once hook kaydi aranir: `tsx index.ts` ile calistirildiginda
 * hook zaten vardir, `dissora start` ile dogrudan calistirildiginda ise
 * burada `tsx` / `ts-node` kaydedilir. Hook'suz ilk deneme yapilmaz; boylece
 * Node'un "Failed to load the ES module" uyarisi basilmaz.
 */
export function loadModuleFile(target: string): unknown {
    const requireFile = createRequire(target);

    if (!isTypeScriptFile(target)) {
        try {
            return requireFile(target);
        } catch (error) {
            throw withInstallHint(error);
        }
    }

    if (!hookAttempted && !hasTypeScriptHook(requireFile)) {
        if (!registerTypeScriptHook()) {
            throw new Error(
                `"${target}" TypeScript icin yukleyici bulunamadi. ` +
                    "Projeye `npm i -D tsx` ekle veya `npx tsx index.ts` ile calistir."
            );
        }

        hookAttempted = true;
    }

    try {
        return requireFile(target);
    } catch (error) {
        throw withInstallHint(error);
    }
}

/**
 * ESM -> CJS transpilasyonundan gelen `{ default: ... }` sarmalayicisini acar.
 *
 * TypeScript ve esbuild, `export default` yazildiginda `__esModule` isaretli
 * bir namespace uretir. `module.exports = {...}` kullanan duz CommonJS
 * dosyalarinda sarmalayici olusmaz.
 */
export function unwrapDefault(loaded: unknown): unknown {
    if (loaded === null || typeof loaded !== "object") {
        return loaded;
    }

    const namespace = loaded as { __esModule?: unknown; default?: unknown };

    if (namespace.__esModule === true && namespace.default !== undefined) {
        return namespace.default;
    }

    return loaded;
}
