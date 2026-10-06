# CLI referansı

```
dissora <komut> [seçenekler]
```

Hiçbir komut verilmezse `dissora start` çalışır.

```bash
dissora --help      # -h
dissora --version   # -v
```

## Komutlar

| Komut | Alias'lar | Açıklama |
| --- | --- | --- |
| `start` | — | Botu başlatır (varsayılan komut) |
| `dev` | `watch` | `Modules/` izlenir, değişince yeniden başlar |
| `create <ad>` | `new` | Çalışma için hazır proje üretir |
| `module <alt>` | `mod` | Modül yönetimi |
| `install <paket>` | `i`, `add` | npm paketinden (ya da `.tgz`) modül kurar |
| `update [modül]` | `upgrade` | Günceller; ad verilmezse tüm kurulu modüller |
| `remove <modül>` | `rm`, `uninstall` | Modülü siler |
| `info` | `doctor`, `status` | Tanılama özeti |
| `config <alt>` | — | Yapılandırma yönetimi |
| `help` | — | Yardım metni |

Bilinmeyen komut: `bilinmeyen komut: <ad>` + çıkış kodu `1`.

### `dissora create <ad> [--ts|--js]`

Proje üretir. Dil verilmezse **JavaScript** kullanılır.

### `dissora module <alt>`

| Alt komut | Alias | Açıklama |
| --- | --- | --- |
| `list` | `ls` | Kurulu modülleri listeler (`v<surum> acik` / `kapali`) |
| `create <ad>` | `new` | Yeni modül klasörü üretir |
| `enable <ad>` | — | Modülü açar (`moduleconfig.json` → `enabled: true`) |
| `disable <ad>` | — | Modülü kapatır |
| `info <ad>` | — | Modül ayrıntısı (kaynak paket, komut, event, görev) |

`module create` seçenekleri:

- `--ts` / `--js` — dil belirtir. Verilmezse **projeden çıkarılır**: mevcut
  modüllerin giriş dosyalarına, yoksa proje kökündeki `tsconfig.json`
  varlığına bakılır.
- `--requires A,B` — `requires` dizisini doldurur.

`module create` yalnızca modül klasörü üretir; proje dosyalarına dokunmaz.

`enable` / `disable` ham metni düzenler: JSON yorumları, girinti ve iç içe
`enabled` alanları korunur, yalnızca **ust seviye** `enabled` değeri değişir.

### `dissora install <paket> [--force]`

Bir npm paketini (ya da yerel `.tgz` / `.tar.gz` yolunu) `Modules/` altına
kurar. Paketin kökünde `moduleconfig.json` bulunmak **zorundadır**; yoksa:

```
Bu paket Dissora modulu degil: <paket> icinde moduleconfig.json yok.
```

Klasör adı şu sırayla seçilir: `--folder` → `moduleconfig.json` `name` →
paket adından arındırılmış hali.

Kurulum, modül klasörüne `.dissora.json` kayıt dosyası yazar:

```json
{
    "package": "@ornek/kaynak",
    "version": "1.0.0",
    "installedAt": "2026-10-06T08:00:00.000Z",
    "source": "@ornek/kaynak"
}
```

**Yerel modül koruması.** Kayıt dosyası olmayan bir klasör kullanıcıya ait
olabilir (`module create` ile üretilmiş). Sessizce ezmez:

```
Modules/Eko klasorunde kurulum kaydi yok; bu yerel bir modul olabilir.
Ezmemek icin --force kullanin: dissora install @ornek/eko --force
```

Aynı klasör **başka bir paketten** kurulmuşsa da durur; `remove` veya
`--force` ister.

**Geri alınabilir kurulum.** Değiştirme işlemi şöyledir:

1. yeni sürüm geçici klasöre kurulur
2. mevcut klasör `.dissora-backup` olarak taşınır
3. yeni sürüm kopyalanır
4. `.dissora.json` yazılır
5. hata olursa eski sürüm **tam olarak** geri yüklenir

Yani `install` / `update` yarım kesilse bile modül kaybolmaz.

### `dissora update [modül] [<paket>]`

Ad verilmezse tüm kurulu modülleri günceller. Paket adı verilmezse
`.dissora.json` içindeki `source` kullanılır; kayıt yoksa hata verir:

```
<modul>: kayit dosyasi yok (.dissora.json). Once "dissora install <paket>" calistir.
```

`update` bir modülü önce silmez — kaynağı hazırlar, sonra güvenli şekilde
değiştirir.

### `dissora config <alt>`

| Alt komut | Alias | Açıklama |
| --- | --- | --- |
| `show` | — | Çözümlenmiş yapılandırma + her değerin hangi katmandan geldiği |
| `path` | `paths` | Yapılandırma dosyalarının yolları |
| `validate` | `check` | Dosyaları doğrular, sorunları raporlar |
| `get <anahtar>` | — | Tek değeri okur (`logging.level`) |
| `set <anahtar> <değer>` | — | Değeri **doğru dosyaya** yazar |

`config set`, değerin türüne göre `BotConfig.json` veya `.env` dosyasını
seçer. Geçersiz değer yazmaz — örneğin `logging.level` için geçersiz seviye:

```
gecersiz log level: "verbose"
```

Bkz. [Yapılandırma](config.md).

### `dissora info`

Tanılama özeti: Node/npm sürümleri, proje yolları, çözümlenmiş yapılandırma
özetleri ve her modülün durumu.

## Seçenekler

| Bayrak | Değer | Etkisi |
| --- | --- | --- |
| `--log-level` | `trace` \| `debug` \| `info` \| `warn` \| `error` \| `silent` | Log seviyesini zorlar (kısaltma `-l`) |
| `--no-banner` | — | Banner'ı yazdırma |
| `--sync` | — | `dev` modunda global komut kaydını da yapar |
| `--no-sync` | — | Komut kaydını tamamen kapatır |
| `--no-color` | — | Renkleri kapatır (`NO_COLOR`/`DISSORA_NO_COLOR` ile aynı) |
| `--force` | — | `install` / `update`: yerel modulü ezme izni |
| `--ts` / `--js` | — | `create` ve `module create` dili |
| `--version` / `-v` | — | Sürüm yazdırır |
| `--help` / `-h` | — | Yardım yazdırır |

Bayraklar komut adından **önce** de verilebilir; renk kararı help metninden
**önce** uygulanır, böylece `--no-color --help` çıktısı da renksizdir.

## Çıkış kodları

| Kod | Durum |
| --- | --- |
| `0` | Başarı (`--help`, `--version`, `create`, `config`, ...) |
| `1` | Hata (bilinmeyen komut, geçersiz argüman, doğrulama hatası) |
| süreç yönetimi | `start` / `dev` süreç bot tarafından yönetilir; CLI çıkış kodu uygulamaz |

## Örnekler

```bash
dissora create my-bot --ts
dissora module create Ekonomi --requires Log
dissora module disable Ekonomi
dissora config set logging.level debug
dissora install @ornek/eko
dissora install ./yorumsal-modul-1.0.0.tgz --force
dissora update
dissora remove Ekonomi
dissora info
```
