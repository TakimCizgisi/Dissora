import { existsSync, type FSWatcher, statSync, watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Logger } from "./Logger.js";

export interface WatchOptions {
    readonly dir: string;
    readonly onChange: (reason: string) => void;
    readonly debounceMs?: number;
    readonly logger?: Logger;
}

export interface WatchHandle {
    close(): void;
    readonly mode: "fs" | "poll" | "none";
}

/**
 * `Modules/` agacini izler ve degisiklikte `onChange` cagirir.
 *
 * Once `fs.watch(recursive)` denenir. Desteklenmeyen platformlarda
 * (ornegin eski Linux cekirdekleri) 1 saniyelik mtime taramasina duser.
 *
 * Dizin yoksa `mode: "none"` doner: `dissora dev` sessizce izlemiyormus
 * gibi gorunmemeli, kullaniciya uyari verilir.
 */
export function watchTree(options: WatchOptions): WatchHandle {
    const debounceMs = options.debounceMs ?? 300;
    const dir = options.dir;

    if (!existsSync(dir)) {
        options.logger?.warn(
            `modul dizini bulunamadi, izleme baslatilamadi: ${dir}`
        );

        return { close: () => {}, mode: "none" };
    }

    let timer: NodeJS.Timeout | null = null;
    let closed = false;

    const trigger = (reason: string) => {
        if (closed) {
            return;
        }

        if (timer) {
            clearTimeout(timer);
        }

        timer = setTimeout(() => {
            timer = null;

            if (closed) {
                return;
            }

            try {
                options.onChange(reason);
            } catch (error) {
                // `onChange` hatasi izleyiciyi oldurmemeli; `dev` kendi
                // hatasini logluyor, izleme devam etmeli.
                options.logger?.warn(
                    `degisiklik isleyici hatasi: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }, debounceMs);

        timer.unref?.();
    };

    let watcher: FSWatcher | null = null;

    try {
        watcher = watch(
            dir,
            { recursive: true, persistent: true },
            (_event, filename) => {
                trigger(filename ? String(filename) : "degisiklik");
            }
        );

        watcher.on("error", error => {
            options.logger?.warn(`izleme hatasi: ${String(error)}`);
        });

        options.logger?.debug(`izleniyor: ${dir}`);

        return {
            mode: "fs",
            close: () => {
                closed = true;

                if (timer) {
                    clearTimeout(timer);
                }

                watcher?.close();
            }
        };
    } catch {
        options.logger?.debug(
            "fs.watch(recursive) kullanilamiyor, tarama ile izleniyor"
        );
    }

    const snapshots = new Map<string, number>();

    /**
     * Ilk tarama yalnizca referans noktasi olusturur.
     *
     * Aksi halde `dissora dev` acilir acilmaz sahte bir degisiklik bildirilir
     * ve bot hicbir kod degismeden bir kez daha baslar.
     */
    let primed = false;

    /**
     * Tarama yeniden giris korumasi.
     *
     * `scan` asenkrondur; 1 saniyelik aralik icinde bitmezse ayni tarama
     * birden fazla kez calisir ve `snapshots` yarim yazilmis halde
     * okunabilir.
     */
    let scanning = false;

    const scan = async () => {
        if (scanning || closed) {
            return;
        }

        scanning = true;

        try {
            await scanOnce();
        } finally {
            scanning = false;
        }
    };

    const scanOnce = async () => {
        const next = new Map<string, number>();

        const walk = async (current: string): Promise<void> => {
            let entries: string[];

            try {
                entries = await readdir(current);
            } catch {
                return;
            }

            for (const entry of entries) {
                const full = join(current, entry);

                try {
                    const stats = statSync(full);

                    if (stats.isDirectory()) {
                        await walk(full);
                        continue;
                    }

                    next.set(full, stats.mtimeMs);
                } catch {
                    // dosya silinmis olabilir
                }
            }
        };

        await walk(dir);

        let changed = false;

        for (const [file, mtime] of next) {
            if (snapshots.get(file) !== mtime) {
                changed = true;
                break;
            }
        }

        if (snapshots.size !== next.size) {
            changed = true;
        }

        snapshots.clear();

        for (const [file, mtime] of next) {
            snapshots.set(file, mtime);
        }

        if (!primed) {
            primed = true;

            return;
        }

        // `next` bos da olabilir: son dosya silindiyse degisiklik yine
        // bildirilmelidir.
        if (changed) {
            trigger("tarama");
        }
    };

    const poll = setInterval(() => {
        void scan();
    }, 1000);

    poll.unref?.();

    void scan();

    return {
        mode: "poll",
        close: () => {
            closed = true;
            clearInterval(poll);

            if (timer) {
                clearTimeout(timer);
            }
        }
    };
}
