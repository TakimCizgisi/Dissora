# Yapılandırma

## Katmanlar

```
varsayılanlar  →  BotConfig.json  →  .env  →  process.env (runtime)
    default            file           env          runtime
```

**Sağdaki soldakini ezer.** `dissora config show` en alt bölümde hangi
değerin hangi katmandan geldiğini raporlar:

```
Katman kaynaklari
  default   DEFAULT_BOT_CONFIG
  file      BotConfig.json
  env       .env
  runtime   -
```

Gerçek ortam değişkenleri `.env` değerlerini **ezer** (dotenv geleneği);
boş `.env` değerleri tanımlı sayılmaz.

```bash
dissora config show        # çözümlenmiş config + katmanlar
dissora config validate    # dosyaları doğrular, sorunda çıkış kodu 1
dissora config path        # dosya yolları
dissora config get logging.level
dissora config set logging.level debug
```

## `BotConfig.json`

```json
{
    "botName": null,
    "status": "online",
    "activity": {
        "type": "watching",
        "name": "Dissora",
        "url": null,
        "state": null
    },
    "intents": ["Guilds", "GuildMessages"],
    "commands": {
        "register": true,
        "pruneStale": true,
        "scope": "auto"
    },
    "logging": {
        "level": "info",
        "timestamps": false
    },
    "owners": [],
    "locale": "tr"
}
```

### Alanlar

| Alan | Varsayılan | Seçenekler |
| --- | --- | --- |
| `botName` | `null` | Bot kullanıcı adını zorlar |
| `status` | `"online"` | `online`, `idle`, `dnd`, `invisible` |
| `activity.type` | `"watching"` | `playing`, `streaming`, `listening`, `watching`, `competing`, `custom` |
| `activity.name` | `"Dissora"` | (`activity.text` da kabul edilir) |
| `activity.url` | `null` | `streaming` için gereklidir |
| `activity.state` | `null` | `custom` / `listening` için |
| `intents` | `["Guilds", "GuildMessages"]` | Aşağıdaki izin listesi |
| `commands.register` | `true` | Girişte komut kaydı |
| `commands.pruneStale` | `true` | Kayıtlı ama dosyada olmayan komutları siler |
| `commands.scope` | `"auto"` | `auto`, `guild`, `global` |
| `logging.level` | `"info"` | `trace` … `silent` |
| `logging.timestamps` | `false` | |
| `owners` | `[]` | Sahip kullanıcı kimlikleri |
| `locale` | `"tr"` | Varsayılan dil kodu |

Bilinmeyen anahtarlar yok sayılır; geçersiz değerler `ConfigError` üretir ve
hangi alanın hatalı olduğunu gösterir:

```
BotConfig.json
  ✖ status: "invisible2" gecersiz (online, idle, dnd, invisible)
```

### İzinler (`intents`)

`Guilds`, `GuildMembers`, `GuildModeration`, `GuildExpressions`,
`GuildIntegrations`, `GuildWebhooks`, `GuildInvites`, `GuildVoiceStates`,
`GuildPresences`, `GuildMessages`, `GuildMessageTyping`,
`GuildMessageReactions`, `GuildMessageContent`, `GuildMessageAttachments`,
`DirectMessages`, `DirectMessageReactions`, `DirectMessageTyping`,
`MessageContent`, `GuildScheduledEvents`, `AutoModerationConfiguration`,
`AutoModerationExecution`

Listede olmayan bir intent `ConfigError` üretir.

> `MessageContent` özel intenttir; Discord Developer Portal'dan da açılmalıdır.

### Komut kapsamı

| `scope` | Davranış |
| --- | --- |
| `auto` (varsayılan) | `DISSORA_GUILD_ID` varsa guild, yoksa global |
| `guild` | Yalnızca belirtilen sunucu — anında görünür |
| `global` | Her sunucu; yayılması dakikalar sürebilir |

## `.env` ve ortam değişkenleri

```env
DISSORA_TOKEN=bot-tokenin
DISSORA_GUILD_ID=123456789012345678
DISSORA_LOG_LEVEL=debug
```

| Değişken | Açıklama | Gizli |
| --- | --- | --- |
| `DISSORA_TOKEN` | Bot token'ı. **Zorunlu.** (eski ad: `DISCORD_TOKEN`) | evet |
| `DISSORA_GUILD_ID` | Sunucu kimliği ya da `all`. (eski ad: `DISCORD_GUILD_ID`) | — |
| `DISSORA_MODULES_DIR` | Modül klasörü (varsayılan `Modules`) | — |
| `DISSORA_LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error`, `silent` | — |
| `DISSORA_LOG_TIMESTAMPS` | Satıra zaman damgası ekler | — |
| `DISSORA_BOT_NAME` | Bot kullanıcı adı | — |
| `DISSORA_STATUS` | `online` \| `idle` \| `dnd` \| `invisible` | — |
| `DISSORA_ACTIVITY_TYPE` | `playing` \| `streaming` \| `listening` \| `watching` \| `competing` \| `custom` | — |
| `DISSORA_ACTIVITY_NAME` | Aktivite metni | — |
| `DISSORA_INTENTS` | Virgülle ayrılmış intent listesi | — |
| `DISSORA_COMMAND_SCOPE` | `auto` \| `guild` \| `global` | — |
| `DISSORA_PRUNE_STALE` | Kayıtlı ama dosyada olmayan komutlar silinsin mi | — |
| `DISSORA_OWNERS` | Virgülle ayrılmış sahip kimlik listesi | — |
| `DISSORA_LOCALE` | Varsayılan dil kodu | — |
| `DISSORA_NO_COLOR` | `1`/`true` ise renkleri kapatır | — |

Liste değerleri (`DISSORA_INTENTS`, `DISSORA_OWNERS`) hem virgül hem boşluk
ile ayrılır: `Guilds, GuildMessages`.

> `DISCORD_TOKEN` ve `DISCORD_GUILD_ID` **fallback** olarak kabul edilir;
> `DISSORA_` öneki tercih edilir.

## Gizli değerler

`token` hiçbir çıktıda düz metin görünmez:

```
dissora config show   →  token  **** (70 karakter)
dissora config get token  →  **** (70 karakter)
dissora config set token=... →  DISSORA_TOKEN = **** (70 karakter)
```

`guildId` de `config get` çıktısında maskelenir.

## `config set` — hangi dosyaya yazar

`set` değerin türüne göre hedefi **otomatik** seçer:

| Anahtar | Hedef |
| --- | --- |
| `botName`, `status`, `locale` | `BotConfig.json` |
| `intents`, `owners` | `BotConfig.json` |
| `activity.type`, `activity.name`, `activity.url`, `activity.state` | `BotConfig.json` |
| `commands.register`, `commands.pruneStale`, `commands.scope` | `BotConfig.json` |
| `logging.level`, `logging.timestamps` | `BotConfig.json` |
| `token`, `guildId`, `modulesDir`, `logLevel`, `logTimestamps`, `commandScope`, `pruneStale`, `activityType`, `activityName` | `.env` |

```bash
dissora config set logging.level debug
dissora config set activity.type watching
dissora config set commands.scope guild
dissora config set owners 123,456
```

Davranış özellikleri:

- **Yalnızca istenen alan yazılır.** Varsayılanların tamamı dosyaya
  dökülmez; dosyadaki yorumlar ve bilinmeyen anahtarlar korunur.
- **Yazmadan önce doğrular.** Geçersiz değer dosyaya hiç gitmez:

  ```
  dissora config set logging.level verbose
  ✖ gecersiz log seviyesi: "verbose" (trace, debug, info, warn, error, silent)
  ```

- **Booleans esnek kabul edilir**: `true/false`, `1/0`, `yes/no`, `on/off`.
  Bunların dışındaki her değer reddedilir (eskiden her şey `false`
  yazılıyordu).
- `.env` yazarken satır sonu biçimi (CRLF/LF) korunur.

Bilinmeyen anahtar:

```
✖ bilinmeyen anahtar: fog.level
  Yazilabilir alanlar: botName, status, locale, intents, owners, ...
```

## Programatik erişim

```ts
import { ConfigService, parseBotConfig, ConfigError } from "dissora";

const service = new ConfigService(process.cwd());
const snapshot = service.snapshot();

snapshot.resolved.bot.logging.level;
snapshot.resolved.token;             // string | null
snapshot.resolved.sources.env;       // ".env"
snapshot.envFile;                    // ham .env değerleri
```

`ConfigError`, `issues: ConfigIssue[]` taşır; her biri `path` + `message`
içerir.

## İlişkili dokümanlar

- [Hızlı başlangıç](getting-started.md) — "İlk çalıştırma" bölümü
- [CLI referansı](cli.md#dissora-config-alt)
