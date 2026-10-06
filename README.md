# Dissora

Typed, modular Discord bot framework'ü ve modül yöneticisi.

Dissora; bağımlılık çözümleyen, sıralı yükleyen, izole hata yönetimi olan ve
temiz kapanış garantisi veren bir modül sistemi üzerine kuruludur. Kaynak tamamen
TypeScript'tir; paket `dist/cjs`, `dist/esm` ve `dist/types` olarak dual
build edilir.

## Dokümantasyon

Ayrıntılı dokümantasyon [`docs/`](docs/) klasöründedir:

| | |
| --- | --- |
| [Hızlı başlangıç](docs/getting-started.md) | Kurulum, proje yapısı, ilk çalıştırma, yaşam döngüsü |
| [CLI referansı](docs/cli.md) | Komutlar, alt komutlar, bayraklar |
| [Modül sistemi](docs/modules.md) | `moduleconfig.json`, dosya keşfi, bağımlılıklar, `install` |
| [Modül API'si](docs/module-api.md) | `defineCommand` / `defineEvent` / `defineAlways`, context'ler |
| [Yapılandırma](docs/config.md) | Katmanlar, `BotConfig.json`, ortam değişkenleri |
| [Public API](docs/api.md) | Paketin dışa aktardığı tüm tipler ve fonksiyonlar |
| [Geliştirme](docs/development.md) | Test, build, release, paketleme, katkı |

## Kurulum

```bash
npm i dissora
```

Node `>=20` gerekir. Bot token'ı `.env` veya gerçek ortam değişkeni ile verilir:

```env
DISSORA_TOKEN=bot-tokenin
```

`DISCORD_TOKEN` da kabul edilir. Gerçek ortam değişkenleri `.env` değerlerini
**ezer** (dotenv geleneği), boş `.env` değerleri tanımlı sayılmaz.

## Kaynaktan kurulum (geliştiriciler)

Kök dizinde `build.bat` tüm zinciri çalıştırır:

1. `npm install` — bağımlılıklar
2. `npm run release` — lint + typecheck + build + test
3. `npm pack` + `npm install -g <tarball>` — gerçek paketleme ve global kurulum
4. `dissora --version` — doğrulama

Adımlardan biri başarısız olursa betik durur ve hangi adımın kırıldığını
yazar; global kurulum yarım bırakılmaz.

`npm install -g .` **kullanılmaz**: Windows'ta kaynak klasoru junction olarak
bağlar, `files` ve `prepack` uygulanmaz. `npm pack` üzerinden kurulum,
paketin gerçekten yalnızca `bin`, `dist` ve `src/templates` taşıdığını
doğrular. Geliştirme döngüsünde `npm run link` kullanılabilir; bu betik
`npm link` çıktısını doğrulamadan "bağlandı" demez, `dissora --version`'ı
gerçekten çalıştırır.

## Hızlı başlangıç

```bash
npx dissora create my-bot --ts
cd my-bot
npm install
npx dissora start
```

`--ts` verilmezse JavaScript şablonu kullanılır. Üretilen proje
`index.ts` / `index.js`, `BotConfig.json`, `.env` ve çalışan bir `Ornek`
modülü içerir.

Programatik kullanım:

```ts
import { DissoraBot } from "dissora";

const bot = new DissoraBot(process.cwd());

await bot.start(); // token -> moduller -> login -> komut senkronizasyonu
```

`bot.stop()` programatik kapanıştır ve süreci sonlandırmaz; sinyal ve yakalanmamış
hata durumlarında framework `process.exit` çağırır.

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `dissora start` | Botu başlatır |
| `dissora dev` | `Modules/` izlenir, değişince yeniden başlar |
| `dissora create <ad> [--ts\|--js]` | Çalışma için hazır proje üretir |
| `dissora module list` | Kurulu modülleri listeler |
| `dissora module create <ad> [sec.]` | Yeni modül üretir |
| `dissora module enable\|disable <ad>` | Modülü açar/kapatır |
| `dissora module info <ad>` | Modül ayrıntısı |
| `dissora install <paket>` | npm paketinden modül kurar |
| `dissora update [modul]` | Günceller (ad verilmezse tümü) |
| `dissora remove <modul>` | Modülü siler |
| `dissora info` | Tanılama özeti |
| `dissora config show\|path\|validate` | Yapılandırmayı gösterir |
| `dissora config get <anahtar>` | Tek değer okur |
| `dissora config set <anahtar> <deger>` | Doğru dosyaya yazar |

Seçenekler: `--log-level <seviye>`, `--no-banner`, `--sync`, `--no-sync`,
`--no-color`, `--version`, `--help`.

## Modüller

Her modül bir klasördür ve `moduleconfig.json` ile tanımlanır:

```json
{
    "name": "Ekonomi",
    "version": "1.0.0",
    "main": "index.ts",
    "enabled": true,
    "requires": ["Log"],
    "commands": { "enabled": true },
    "events": {
        "enabled": true,
        "files": [{ "event": "ready", "file": "Event/ready.ts" }]
    },
    "always": { "enabled": false, "tasks": [] }
}
```

`requires` bağımlılıkları önce yüklenir; eksik ya da döngüsel bağımlılık
raporlanır. Bir modülün `init`/`start` çağrıları başarısız olursa o modüle ait
komut, event ve zamanlayıcı kayıtları geri alınır; diğer modüller çalışmaya
devam eder.

### Modül giriş noktası

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

### Komut

```ts
import { defineCommand } from "dissora";

export default defineCommand({
    data: { name: "ping", description: "Gecikmeyi gosterir" },
    execute: async context => {
        await context.interaction.reply("pong");
    }
});
```

### Event

Event dinleyicileri **`ModuleContext` almaz** — argümanlar doğrudan
`discord.js`'ten gelir. İki biçim de desteklenir:

```ts
import { defineEvent } from "dissora";

export default defineEvent("ready", client => {
    console.log(client.user?.tag);
});

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

Modül adı, logger ve `ModuleContext`'e ihtiyacın varsa bunu event'te değil,
modülün `index.ts` dosyasındaki `init(context)` içinde sakla.

### Görev (always)

`interval` `moduleconfig.json`'da tanımlıdır; dosyada tekrar yazman gerekmez.
Dosyada verirsen **config'in üstüne yazar**:

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

Sadece `execute` yazarsan `moduleconfig.json`'daki `interval` ve
`runOnStart` kullanılır. Düz fonksiyon export etmek de geçerlidir:

```ts
export default function (context: ModuleContext): void {
    context.log.trace("ticker");
}
```

## Modül üretme

```bash
dissora module create Ekonomi
dissora module create Ekonomi --ts
dissora module create Ekonomi --js --requires Log,Utils
```

`--ts` / `--js` verilmezse dil projeden çıkarılır: mevcut modüllerin giriş
dosyalarına ve `tsconfig.json` varlığına bakılır, hiçbiri yoksa JavaScript
kullanılır. `dissora module create` yalnızca modül klasörü üretir; proje
dosyalarına dokunmaz.

## Config katmanları

```
varsayılanlar → BotConfig.json → .env → process.env
```

`dissora config show` hangi katmandan hangi değerin geldiğini raporlar.
`config set`, değerin türüne göre `BotConfig.json` veya `.env` dosyasına yazar.

Öne çıkan ortam değişkenleri:

| Değişken | Açıklama |
| --- | --- |
| `DISSORA_TOKEN` / `DISCORD_TOKEN` | Bot token'ı |
| `DISSORA_LOG_LEVEL` | `trace` … `silent` |
| `DISSORA_LOG_TIMESTAMPS` | Zaman damgası aç/kapat |
| `DISSORA_MODULES_DIR` | Modül klasörü adı (varsayılan `Modules`) |
| `DISSORA_COMMAND_SCOPE` | `auto` / `guild` / `global` |
| `DISCORD_GUILD_ID` | GUILD kapsamı için sunucu kimliği |
| `DISSORA_PRUNE_STALE` | Silinmiş komutları temizle |
| `DISSORA_OWNERS` | Sahip kullanıcı kimlikleri |
| `DISSORA_NO_COLOR` | Renkleri kapat |

## Public API

`dissora` paketi bot tarafı, modül tarafı ve yardımcıları dışa aktarır:

- Bot: `DissoraBot`, `BotOptions`, `BotState`
- Config: `ConfigService`, `ConfigError`, `parseBotConfig`, `parseModuleConfig`
- Modül sistemi: `ModuleHost`, `Registry`, `TimerRegistry`, `Shutdown`,
  `resolveModulePlan`, `createModuleRuntime`
- Loader'lar: `LOADERS`, `CommandLoader`, `EventLoader`, `AlwaysLoader`,
  `LoaderError`
- Tanım fonksiyonları: `defineCommand`, `defineEvent`, `defineAlways`
- Tipler: `ModuleContext`, `CommandModule`, `EventModule`, `AlwaysModule`,
  `CommandData`, `Disposer`, `ModuleExports`

## Geliştirme

```bash
npm run lint       # biome check
npm run typecheck  # kaynak + şablon tipleri
npm test           # vitest
npm run build      # dual build (cjs + esm + types)
npm run release    # lint + typecheck + build + test
```

Depoyu yerel bir projede denemek için:

```bash
npm run build
npm run link
```

## Lisans

MIT
