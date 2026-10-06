# Modül sistemi

Dissora'da her şey bir modüldür. Modül, `Modules/` altında bir klasördür ve
`moduleconfig.json` ile tanımlanır. Bot tüm mantığı bu klasörlerden okur;
`index.ts` yalnızca giriş noktasıdır.

```
Modules/
├── Log/
│   ├── moduleconfig.json     # zorunlu
│   ├── index.ts              # init / start (isteğe bağlı)
│   ├── Command/
│   ├── Event/
│   └── Always/
└── Ekonomi/
    ├── moduleconfig.json
    └── ...
```

## `moduleconfig.json`

**Tek zorunlu alan `name`'dir.** En küçük geçerli dosya budur:

```json
{ "name": "Economy" }
```

### Tam şema

```json
{
    "name": "Ekonomi",
    "version": "1.0.0",
    "description": "Sunucu ekonomisi",
    "author": "takim",
    "license": "MIT",
    "homepage": "https://github.com/...",
    "main": "index.ts",
    "enabled": true,
    "requires": ["Log"],

    "commands": {
        "enabled": true,
        "files": null
    },
    "events": {
        "enabled": true,
        "files": [
            { "event": "guildMemberAdd", "file": "Event/uye.ts" },
            { "event": "ready", "file": "Event/hazir.ts", "once": true }
        ]
    },
    "always": {
        "enabled": true,
        "tasks": [
            { "file": "Always/rapor.ts", "interval": 300000, "runOnStart": true }
        ]
    }
}
```

### Alanlar ve varsayılanlar

| Alan | Varsayılan | Açıklama |
| --- | --- | --- |
| `name` | **zorunlu** | Klasör adıyla eşleşmeli. Desen: `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` (path traversal engeli) |
| `version` | `0.0.0` | |
| `description`, `author`, `license`, `homepage` | `null` | |
| `main` | `index.js` | Giriş dosyası (TS projelerde `index.ts`) |
| `enabled` | `true` | `false` ise modül hiç yüklenmez (`skipped`) |
| `requires` | `[]` | Yüklenecek diğer modül adları. Modül kendine bağlı olamaz |
| `commands.enabled` | **`true`** | |
| `commands.files` | **`null`** | `null` → `Command/` klasörü otomatik taranır |
| `events.enabled` | **`false`** | Event yüklemek için **açıkça `true` yazın** |
| `events.files` | `[]` | Kayıt listesi — otomatik tarama yoktur |
| `always.enabled` | **`false`** | Görev yüklemek için **açıkça `true` yazın** |
| `always.tasks` | `[]` | Kayıt listesi — otomatik tarama yoktur |

> `events.enabled` ve `always.enabled` **kapalı** doğar. Dosya ekleyip
> `enabled` yazmayı unutursanız yüklenmez; bu, kazara dinleyici ve
> zamanlayıcı bağlanmasını engeller.

`interval` için en az değer `1000` ms'dir; altında hata üretilir.

## Dosya keşfi

Üç loader üç farklı kural uygular:

### Command — otomatik

`commands.files` **yoksa** `Command/` klasörü taranır ve içindeki tüm betik
dosyaları yüklenir. `commands.files` **varsa** yalnızca onlar yüklenir:

```json
"commands": {
    "enabled": true,
    "files": [
        "Command/ping.ts",
        { "file": "Command/yardim.ts", "name": "yardim" }
    ]
}
```

Liste kullanıldığında `name` isteğe bağlıdır; verilirse dosyanın `data.name`
ile aynı olmalıdır.

### Event — yalnızca liste

`events.files` içindeki her kayıt:

```json
{ "event": "ready", "file": "Event/hazir.ts", "once": true }
```

- **Nesne biçiminde `event` zorunludur.**
- **Dizgi (string) biçiminde** olay adı dosyanın `event` export'undan gelir:

```json
"files": ["Event/hazir.ts"]
```

```ts
export default defineEvent("ready", client => { ... });
```

`once` değeri config ile dosya arasındaki **VEYA** ilişkisindedir: config'de
`true` **veya** dosyada `once: true` varsa dinleyici tek seferlik bağlanır.

### Always — yalnızca liste

```json
"tasks": [{ "file": "Always/rapor.ts", "interval": 300000, "runOnStart": true }]
```

`interval` zorunludur (en az 1000 ms). Dosyadaki `defineAlways({...})`
değerleri config'in **üzerine yazar**:

```
dosya.interval  ?? config.interval
dosya.runOnStart ?? config.runOnStart
```

Yani periyodu yalnızca koddan değiştirerek başka bir modülle görev
paylaşabilirsiniz. Ayrıntı → [Modül API'si](module-api.md#definealways).

## Ad ve tutarlılık kuralları

Discord komut adları küçük harf ister (`/PING` hata verir). Dissora adı
`trim().toLowerCase()` ile indirger ve üç noktayı karşılaştırır:

1. `moduleconfig.json` → `commands.files[].name`
2. dosya → `command.name`
3. dosya → `command.data.name`

Aralarında uyuşmazlık varsa dosya **yüklenmez** ve uyarı yazılır:

```
config'deki ad (PING) ile data.name (ping) uyusmuyor
```

Geçerli ad deseni: `^[-_\p{L}\p{N}]{1,32}$` (Türkçe karakterler dahil).

`data.description` yoksa `"Dissora komutu"` yazılır.

## Bağımlılıklar ve yükleme sırası

`requires` bağımlılıkları **önce** yüklenir. `resolveModulePlan` topolojik
sıralama yapar:

| Durum | Sonuç |
| --- | --- |
| Bağımlılık `enabled: false` ya da hiç yoksa | Bağlı modül `skipped`, okunabilir neden yazılır |
| `A → B → A` gibi döngü | `errors` içine okunabilir yol: `bagimlilik dongusu: A -> B -> A` |
| Bozuk config | `errors` içine neden |

```
dissora module list
```

çıkışında `skipped` / `failed` modüller nedeniyle birlikte görünür.

## Hata izolasyonu

Yükleme sırası:

```
main dosyasını oku
  → init(context)        (isteğe bağlı)
  → CommandLoader / EventLoader / AlwaysLoader
  → start(context)        (isteğe bağlı)
```

Davranışlar farklıdır:

| Hata | Sonuç |
| --- | --- |
| `moduleconfig.json` okunamaz, `main` bulunamaz, `init`/`start` fırlatır | Modül **`failed`** → tüm kayıtları geri alınır, bot **durmaz** |
| Tek bir loader hatası (ör. geçersiz komut adı) | **Uyarı** yazılır, modül yüklenmeye devam eder |
| Bir event handler'ı hata fırlatır | Yalnızca o handler için `error` log'lanır, süreç yaşar |

Geri alma (`rollback`) şunları kapsar: registry kayıtları (komut + event),
zamanlayıcılar ve `exports` girişi. Yarım yüklenmiş modül iz bırakmaz:

```ts
registry.rollback(snapshot);
timers.rollback(timerSnapshot);
runtime.commands.length = 0;
runtime.events.length = 0;
runtime.tasks.length = 0;
```

Başarılı yükleme logu:

```
Ekonomi: yuklendi: 3 komut, 2 event, 1 gorev
```

## Modülleri yönetmek

```bash
dissora module list
dissora module info Ekonomi
dissora module disable Ekonomi     # moduleconfig.json -> enabled: false
dissora module enable Ekonomi
dissora remove Ekonomi             # klasörü siler
```

`enable` / `disable` ham metni düzenler: yorumlar, girinti ve iç içe `enabled`
alanları korunur.

## Modülü paketleyip yayınlamak

Bir Dissora modülü, **kökünde `moduleconfig.json` bulunan** sıradan bir npm
paketidir.

### 1. Paketi hazırla

Modül klasörünü paket köküne koyun:

```
dissora-eko/
├── package.json          # name: "@siz/eko"
├── moduleconfig.json     # zorunlu
├── index.ts
├── Command/
├── Event/
└── Always/
```

`package.json` için:

```json
{
    "name": "@siz/eko",
    "version": "1.0.0",
    "files": ["moduleconfig.json", "index.ts", "Command", "Event", "Always"],
    "peerDependencies": {
        "discord.js": "^14.27.0"
    }
}
```

> `dissora`'yı **bağımlılık** olarak eklemeyin: `define*` fonksiyonları ve
> loader'lar dosyayı host proje üzerinden çalıştırır. Modül dosyalarının
> `dissora` paketine bağımlı olması gerekmez.

### 2. Yayınla

```bash
npm publish --access public
```

### 3. Kur

```bash
dissora install @siz/eko
```

Yerel bir tarball ile de deneyebilirsiniz:

```bash
npm pack
dissora install ./siz-eko-1.0.0.tgz
```

Kurulum klasör adını `moduleconfig.json` → `name` alanından alır; `--folder`
ile ezebilirsiniz.

### 4. Güncelle

```bash
# package.json sürümünü yükseltip yeniden yayınlayın
dissora update Ekonomi
```

`update` önce silmez: kaynağı hazırlar, `.dissora-backup` ile güvenli
şekilde değiştirir, hata olursa eski sürümü tam geri yükler.

## İlişkili dokümanlar

- [Modül API'si](module-api.md#definealways) — `defineCommand`, `defineEvent`, `defineAlways`, `init` / `start`
- [Yapılandırma](config.md) — `BotConfig.json` ve ortam değişkenleri
- [CLI referansı](cli.md) — `module`, `install`, `update`, `remove`
