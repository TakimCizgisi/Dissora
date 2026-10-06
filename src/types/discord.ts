/**
 * discord.js tip genisletmeleri.
 *
 * `Client` uzerine framework alanlarini ekler. Bu dosya bir modul olsa da
 * yan etkisi `declare module` oldugu icin `src/index.ts` tarafindan
 * yanlislikla yuklenmemelidir; tip dosyasi olarak referans verilir.
 */

import type { Client } from "discord.js";

import type { DissoraClient } from "../core/DissoraClient.js";
import type { RegisteredCommand } from "../core/Registry.js";

declare module "discord.js" {
    interface Client {
        /**
         * Framework tarafindan kaydedilen slash komutlari.
         * Anahtar: `data.name`.
         */
        commands: Map<string, RegisteredCommand>;
        /** Dissora cerceve API'si. */
        dissora: DissoraClient;
    }
}

export type { Client };
