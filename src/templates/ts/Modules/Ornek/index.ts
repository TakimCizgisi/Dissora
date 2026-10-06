import type { ModuleContext } from "dissora";

/**
 * Modul giris noktasi.
 *
 * `init`  -> dosyalar yuklenmeden once (bagimliliklar, konfigurasyon)
 * `start` -> komut/event/gorev dosyalari yuklendikten sonra
 */
export function init(context: ModuleContext): void {
    context.log.info("baslatiliyor");
}

export function start(context: ModuleContext): void {
    context.log.info(
        `${context.module} hazir: ${context.registry.commands.size} komut, ${context.registry.events.length} event`
    );
}
