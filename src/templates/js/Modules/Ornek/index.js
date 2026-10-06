/**
 * Modul giris noktasi.
 *
 * `init`  -> dosyalar yuklenmeden once (bagimliliklar, konfigurasyon)
 * `start` -> komut/event/gorev dosyalari yuklendikten sonra
 */
module.exports = {
    init(context) {
        context.log.info("baslatiliyor");
    },

    start(context) {
        context.log.info(
            `${context.module} hazir: ${context.registry.commands.size} komut, ${context.registry.events.length} event`
        );
    }
};
