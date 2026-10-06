# Hızlı başlangıç

## Gereksinimler

- Node.js `>= 20`
- Bir Discord bot token'ı ([Discord Developer Portal](https://discord.com/developers/applications) → Bot → Token)

## Kurulum

### Yeni proje

```bash
npx dissora create my-bot --ts
cd my-bot
npm install
```

`--ts` verilmezse **JavaScript şablonu** kullanılır (varsayılan budur):

```bash
npx dissora create my-bot        # JavaScript
```

### Mevcut projeye ekleme

```bash
npm i dissora
```

## Token

`.env` dosyasına yazın:

```env
DISSORA_TOKEN=bot-tokenin
```

`DISCORD_TOKEN` da kabul edilir, ancak `DISSORA_TOKEN` önceliklidir. Gerçek
ortam değişkenleri `.env` değerlerini **ezer** (dotenv geleneği); boş `.env`
değerleri tanımlı sayılmaz.

> Token hiçbir CLI çıktısında düz metin gösterilmez. `dissora config show`
> onu `abcd...wxyz` biçiminde maskeler.

## Üretilen proje yapısı

```
my-bot/
├── .env                  # token ve ortam değişkenleri
├── .gitignore
├── BotConfig.json        # bot yapılandırması
├── index.ts              # giriş noktası
├── package.json
├── README.md
├── tsconfig.json         # yalnızca --ts
└── Modules/
    └── Ornek/            # çalışan örnek modül
        ├── moduleconfig.json
        ├── index.ts
        ├── Command/ornek.ts
        ├── Event/ready.ts
        └── Always/ticker.ts
```

Tüm iş mantığı `Modules/` altında yaşar; `index.ts` yalnızca giriş noktasıdır:

```ts
import { DissoraBot } from "dissora";

async function main(): Promise<void> {
    const bot = new DissoraBot(process.cwd());

    await bot.start();
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
```

## İlk çalıştırma

```bash
npm run dev          # dissora dev — Modules/ izlenir
# veya
npx dissora start    # tek seferlik çalıştırma
```

`package.json` şunları içerir:

```json
{
    "scripts": {
        "start": "dissora start",
        "dev": "dissora dev",
        "typecheck": "tsc --noEmit"
    }
}
```

### Komutların Discord'a kaydı

`BotConfig.json` → `commands.register` (varsayılan `true`) açıkken bot
girişte komutları kaydeder. `commands.scope` üç değerden biridir:

| Değer | Davranış |
| --- | --- |
| `auto` (varsayılan) | `DISSORA_GUILD_ID` varsa guild, yoksa global |
| `guild` | Yalnızca belirtilen sunucuya — anında görünür, geliştirme için önerilir |
| `global` | Her sunuca, yayılması dakikalar sürebilir |

Geliştirmede guild kapsamı kullanın:

```env
DISSORA_GUILD_ID=123456789012345678
```

`commands.pruneStale` (`true`) kayıtlı olup dosyada olmayan komutları temizler.

## Programatik kullanım

```ts
import { DissoraBot } from "dissora";

const bot = new DissoraBot(process.cwd(), {
    logLevel: "debug",
    registerCommands: true,
    exitOnShutdown: false
});

bot.onDispose(() => console.log("temizlendi"));

await bot.start();
console.log(bot.state);          // "ready"
console.log(bot.isReady);        // true
console.log(bot.summary());      // { total, loaded, skipped, failed, ... }

await bot.stop();                // süreç sonlandırmaz
```

`bot.stop()` programatik kapanıştır ve `process.exit` **çağırmaz**. Sinyal ve
yakalanmamış hata durumlarında ise framework süreci sonlandırır.

`DissoraBot` seçenekleri (`BotOptions`):

| Seçenek | Açıklama |
| --- | --- |
| `logLevel` | Bu örnek için log seviyesini zorlar |
| `registerCommands` | `BotConfig.commands.register`'u ezer |
| `overrides` | `BotConfig` üzerine çalışma zamanı değeri |
| `env` / `skipDotenv` | Ortam değişkeni kaynağı |
| `clientFactory` | Test için sahte client üretici |
| `clientOptions` | `discord.js` `ClientOptions` parçası |
| `exitOnShutdown` | Süreç kapanışta çıkış kodu uygulasın mı |
| `hooks.onReady` | Giriş tamamlandığında çalışır |

## Yaşam döngüsü

```
start()
  1. config oku (varsayılan → BotConfig.json → .env → process.env)
  2. modülleri tara, bağımlılık planını çöz, sırayla yükle
     - init(context)   → dosyalar yüklenmeden önce
     - loader'lar      → Command / Event / Always
     - start(context)  → dosyalar yüklendikten sonra
  3. Discord'a bağlan
  4. komutları kaydet

stop()
  1. onDispose() kayıtları (modül öncelikli)
  2. event dinleyicilerini kaldır
  3. zamanlayıcıları durdur
  4. bağlantıyı kapat
```

`BotState` değerleri: `idle → loading → connecting → ready → stopping → stopped`.

Bir modülün `init`/`start` çağrısı başarısız olursa **o modüle ait** komut,
event ve zamanlayıcı kayıtları geri alınır, modül `failed` olur; diğer
modüller çalışmaya devam eder.

## Sıradaki adım

- Modül yazmak için → [Modül API'si](module-api.md)
- Modülü paketleyip dağıtmak için → [Modül sistemi](modules.md) ("Modülü paketleyip yayınlamak")
- Yapılandırmayı değiştirmek için → [Yapılandırma](config.md)
