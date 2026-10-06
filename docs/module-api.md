# Modül API'si

Modül dosyaları `dissora` paketinden şunları kullanır:

```ts
import { defineCommand, defineEvent, defineAlways } from "dissora";
import type { ModuleContext, CommandContext } from "dissora";
```

`define*` fonksiyonları **kimlik fonksiyonudur**: çalışma zamanında yalnızca
doğrulama yapar, nesneyi olduğu gibi döndürür. Böylece modül dosyaları
`dissora` paketine bağımlı olmadan da çalışabilir.

## Modül giriş noktası: `index.ts`

```ts
import type { ModuleContext } from "dissora";

export function init(context: ModuleContext): void {
    // Dosyalar yüklenmeden önce çalışır.
    context.log.info("hazır");
}

export function start(context: ModuleContext): void {
    // Komut / event / görev dosyaları yüklendikten sonra çalışır.
    context.log.info(`${context.registry.commands.size} komut`);
}
```

Her ikisi de isteğe bağlıdır ve `await` edilebilir.

| Fonksiyon | Zamanlama | Tipik kullanım |
| --- | --- | --- |
| `init` | main dosyası okunduktan hemen sonra, loader'lardan **önce** | Bağlantı havuzu hazırlama, dosya doğrulama, `registerCommand` / `registerEvent` |
| `start` | tüm loader'lar bittikten sonra | Kayıtları gözden geçirme, `runOnStart` benzeri işler |

> `init` veya `start` hata fırlatırsa modül `failed` olur ve **tüm**
> kayıtları geri alınır; bot çalışmaya devam eder.

## `defineCommand`

```ts
import { defineCommand } from "dissora";

export default defineCommand({
    data: { name: "ping", description: "Gecikmeyi gosterir" },
    execute: async context => {
        await context.interaction.reply("pong");
    }
});
```

| Alan | Zorunlu | Açıklama |
| --- | --- | --- |
| `execute` | **evet** | `(context: CommandContext) => unknown \| Promise<unknown>` |
| `data` | hayır | `SlashCommandBuilder`, düz JSON ya da `{ toJSON() }` üreten nesne |
| `name` | hayır | `data` yoksa kullanılır; `data.name` ile aynı olmalı |
| `description` | hayır | `data` yoksa kullanılır, yoksa `"Dissora komutu"` |

`data` hiç yoksa en az `name` gerekir; aksi halde `LoaderError`:

```
data ya da name gerekli
```

### `data` biçimleri

```ts
// 1. SlashCommandBuilder
import { SlashCommandBuilder } from "discord.js";

data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Gecikmeyi gosterir")

// 2. Düz JSON
data: { name: "ping", description: "Gecikmeyi gosterir" }

// 3. toJSON() üreten nesne
data: { toJSON: () => ({ name: "ping", description: "..." }) }
```

Ad her durumda `trim().toLowerCase()` ile normalize edilir ve
`^[-_\p{L}\p{N}]{1,32}$` deseninden geçmek zorundadır.

`execute` bir `TypeError` fırlatırsa ya da reddedilmiş promise dönerse
framework bunu yakalar, `error` loglar ve süreç yaşar.

## `defineEvent`

Event dinleyicileri **`ModuleContext` almaz** — argümanlar doğrudan
`discord.js`'ten gelir.

```ts
import { defineEvent } from "dissora";

// Biçim 1: kısa
export default defineEvent("ready", client => {
    console.log(client.user?.tag);
});

// Biçim 2: nesne
export default defineEvent({
    event: "ready",
    once: true,
    execute: client => {
        console.log(client.user?.tag);
    }
});
```

`interactionCreate` gibi olaylarda imza `(interaction, client)` olur:

```ts
export default defineEvent("interactionCreate", interaction => {
    if (!interaction.isChatInputCommand()) return;
    console.log(interaction.commandName);
});
```

| Alan | Zorunlu | Açıklama |
| --- | --- | --- |
| `event` | **evet** | `discord.js` olay adı |
| `execute` | **evet** | Olay argümanlarını aynen alır |
| `once` | hayır | `true` ise tek seferlik dinleyici |

`once`, `moduleconfig.json`'daki `once` ile **VEYA** ilişkilidir: ikisinden
biri `true` ise tek seferlik bağlanır.

> Olay adları tek bir tip havuzundan gelmediği için `event` string'tir;
> tip denetimi zorunlu değildir.
>
> **Modül adına, logger'a veya `ModuleContext`'e** ihtiyacınız varsa bunu
> event'te değil, `index.ts` içindeki `init(context)` içinde saklayın.

## `defineAlways`

Zamanlanmış periyodik görev.

```ts
import { defineAlways } from "dissora";

export default defineAlways({
    name: "periyodik-rapor",
    interval: 300_000,
    runOnStart: true,
    execute: context => {
        context.log.info("calisti");
    }
});
```

İki biçim:

```ts
// 1. fonksiyon + seçenekler
export default defineAlways(context => {
    context.log.trace("ticker");
}, { interval: 60_000, runOnStart: true });

// 2. nesne
export default defineAlways({ interval: 60_000, execute: context => {} });
```

Düz fonksiyon export etmek de geçerlidir (config'teki değerler kullanılır):

```ts
export default function (context: ModuleContext): void {
    context.log.trace("ticker");
}
```

| Alan | Açıklama |
| --- | --- |
| `execute` | **Zorunlu.** `(context: ModuleContext) => unknown` |
| `interval` | Periyot (ms). **`moduleconfig.json`'da tanımlıysa yazmak zorunda değilsiniz.** Pozitif ve sonlu olmalı, yoksa `TypeError` |
| `runOnStart` | Zamanlayıcı bağlandıktan hemen sonra bir kez çalışır mı |
| `name` | Günlük etiketi. Yalnızca `TimerRegistry` anahtarı olarak kullanılır; kaldırılması modülün loglarını değiştirmez |

### Öncelik: dosya config'in üzerine yazar

```
dosya.interval   ?? moduleconfig.interval
dosya.runOnStart ?? moduleconfig.runOnStart
```

| Durum | Sonuç |
| --- | --- |
| Sadece config'te `interval` var | Config değeri kullanılır |
| Dosyada `interval` var | **Dosya kazanır** — periyodu koddan değiştirmek yeterli |
| Hiçbirinde yok | `periyot gecersiz (...)` hatası, görev yüklenmez |

Bu, aynı görevi başka bir modülle paylaşırken periyodu koddan ayarlamanıza
imkân verir.

`interval` config'te en az `1000` ms olmalıdır.

### Zamanlayıcı davranışı

Görev `TimerRegistry` üzerine `context.timers.every(label, interval, fn)`
ile bağlanır. Etiket biçimi:

```
<modul>/<gorev-adi>
```

ör. `Sayac/periyodik-rapor`. Etiket hem loglarda hem de kapanış
özetinde görünür:

```
zamanlayici baslatildi: Sayac/periyodik-rapor (30000ms)
```

Kapanışta tüm zamanlayıcılar temizlenir.

## `ModuleContext`

`init` ve `start` ile `defineAlways` `execute`'una verilir.

```ts
interface ModuleContext {
    readonly client: Client;            // discord.js Client
    readonly bot: DissoraBot;           // sahip bot
    readonly module: string;            // klasör adı (benzersiz anahtar)
    readonly folder: string;            // modül klasörünün mutlak yolu
    readonly config: ModuleConfig;      // moduleconfig.json
    readonly env: NodeJS.ProcessEnv;
    readonly log: Logger;               // modül etiketli child logger
    readonly dissora: DissoraClient;    // framework servisleri
    readonly paths: ProjectPaths;       // proje yolları
    readonly timers: TimerRegistry;
    readonly registry: Registry;        // kayıtlı komut/event/handler
    readonly resolved: ResolvedConfig;  // çözümlenmiş yapılandırma

    registerCommand(command: CommandModule): void;  // dosya yerine programatik
    registerEvent(event: EventModule): void;
    onDispose(disposer: Disposer): void;            // kapanışta çalışır
}
```

### Programatik kayıt

Dosya yerine kod üzerinden de kayıt yapılabilir:

```ts
export function init(context: ModuleContext): void {
    context.registerCommand({
        data: { name: "merhaba", description: "Selam verir" },
        execute: ctx => ctx.interaction.reply(`Merhaba ${ctx.interaction.user}`)
    });

    context.registerEvent({
        event: "messageCreate",
        execute: message => {
            if (message.content === "!ping") void message.reply("pong");
        }
    });
}
```

### Temizlik

```ts
export function init(context: ModuleContext): void {
    const connection = openConnection();

    context.onDispose(() => connection.close());
}
```

`onDispose` kayıtları kapanışta **modül öncelikli** çalışır; ardından event
dinleyicileri sökülür ve zamanlayıcılar durdurulur.

## `CommandContext`

`defineCommand` → `execute`'a verilir.

```ts
interface CommandContext {
    readonly interaction: ChatInputCommandInteraction;
    readonly client: Client;
    readonly module: string;                 // komutun sahibi modül
    readonly config: ModuleConfig | BotConfig;
    readonly env: NodeJS.ProcessEnv;
    readonly log: Logger;
    readonly dissora: DissoraClient;
}
```

Tam örnek:

```ts
import { defineCommand } from "dissora";

export default defineCommand({
    data: {
        name: "sayac",
        description: "Kalan sureyi gosterir"
    },
    execute: async context => {
        const remaining = 60;

        context.log.debug(`kalan: ${remaining}`);

        await context.interaction.reply({
            content: `Kalan: ${remaining} saniye`,
            ephemeral: true
        });
    }
});
```

> `execute` içinde `interaction.reply` **zorunlu değildir**; Discord 15
> dakika sonra yanıtlanmamış etkileşimi reddeder. `deferReply()` kullanın.

## Tam örnek: olay + komut + görev

```ts
// Modules/Sayac/index.ts
import type { ModuleContext } from "dissora";

let startedAt = Date.now();

export function start(context: ModuleContext): void {
    startedAt = Date.now();
    context.log.info(`baslatildi, ${context.registry.commands.size} komut`);
}

export function reset(): void {
    startedAt = Date.now();
}
```

```ts
// Modules/Sayac/Command/sayac.ts
import { defineCommand } from "dissora";

export default defineCommand({
    data: { name: "sayac", description: "Gecen sureyi yazar" },
    execute: async context => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        await context.interaction.reply(`${seconds} saniye oldu`);
    }
});
```

```ts
// Modules/Sayac/Event/ready.ts
import { defineEvent } from "dissora";

export default defineEvent("ready", client => {
    console.log(`Giris yapildi: ${client.user?.tag}`);
});
```

```ts
// Modules/Sayac/Always/rapor.ts
import { defineAlways } from "dissora";

export default defineAlways({
    name: "rapor",
    execute: context => {
        context.log.info("calisti");
    }
});
```

```json
// Modules/Sayac/moduleconfig.json
{
    "name": "Sayac",
    "version": "1.0.0",
    "main": "index.ts",
    "enabled": true,
    "requires": [],
    "commands": { "enabled": true },
    "events": {
        "enabled": true,
        "files": [{ "event": "ready", "file": "Event/ready.ts", "once": true }]
    },
    "always": {
        "enabled": true,
        "tasks": [{ "file": "Always/rapor.ts", "interval": 30000 }]
    }
}
```

> `Always/rapor.ts` içinde `interval` yazılmadığı için config'teki
> `30000` kullanılır.
