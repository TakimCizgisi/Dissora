# Geliştirme

## Depo yapısı

```
├── bin/dissora.js          # global CLI shim'i (build yoksa anlaşılır hata verir)
├── dist/                   # git'e girmez — cjs + esm + types
├── scripts/
│   ├── clean.mjs           # dist/ siler
│   ├── sync-version.mjs    # src/version.ts ↔ package.json denetimi
│   ├── postbuild.mjs       # dual build + şablon doğrulaması
│   └── link.mjs            # npm link çıktısını doğrular
├── src/
│   ├── bin/dissora.ts      # CLI giriş noktası
│   ├── cli/                # alt komutlar
│   ├── config/             # BotConfig / moduleconfig / katman çözümleme
│   ├── core/               # Bot, ModuleHost, Registry, DependencyResolver
│   ├── loaders/            # Command / Event / Always
│   ├── services/           # Installer, PackageService, Watcher, Logger
│   ├── templates/          # js/ ve ts/ şablonları (paketlenir)
│   ├── types/              # define* ve context tipleri
│   └── utils/
├── test/                   # vitest
├── build.bat               # Windows: install → release → pack → global kur
├── biome.json
├── tsconfig*.json
└── vitest.config.ts
```

## Script'ler

```bash
npm run lint        # biome check
npm run lint:fix    # biome check --write
npm run format      # biome format --write
npm run typecheck   # tsc -p tsconfig.json && tsc -p tsconfig.templates.json
npm test            # vitest run (313 test, 19 dosya)
npm run test:watch  # vitest
npm run build       # clean → version:sync → cjs → esm → types → postbuild
npm run release     # lint && typecheck && build && test
npm run clean       # dist/ siler
npm run version:sync           # src/version.ts tutarlılığını denetler
npm run version:sync -- --write  # senkron değilse yazar
npm run dev         # tsx watch src/bin/dissora.ts
npm run link        # npm link + dissora --version doğrulaması
```

`prepack` ve `prepublishOnly` ikisi de `npm run release` çalıştırır; bu
yüzden `npm pack` ve `npm publish` kendiliğinden tam doğrulama yapar.

### `release` sırası neden `build` → `test`

`package-root.test.ts` üretilen `dist/` üzerinden `dissora --version`
çıktısını `package.json` sürümüyle karşılaştırır. Sürüm yükseltilip de
`dist/` bayat kaldıysa test yanlış başarısız olur. Bu yüzden önce derlenir.
Test ayrıca bayat çıktı görürse kendisi yeniden derler.

## Testler

```bash
npm test
```

`test/` içindeki 19 dosya:

| Dosya | Kapsam |
| --- | --- |
| `cli-args.test.ts` | Argüman ayrıştırma ve bayraklar |
| `cli-create-module.test.ts` | `module create` şablonları |
| `config.test.ts`, `config-resolve.test.ts`, `config-cli.test.ts` | Katmanlar, `get`/`set`, maskelerme |
| `create-project.test.ts` | `dissora create` çıktısı |
| `define.test.ts` | `defineCommand` / `defineEvent` / `defineAlways` doğrulaması |
| `dependency-resolver.test.ts` | Topolojik sıralama, döngü, skip |
| `loaders.test.ts` | Command / Event / Always keşfi ve hataları |
| `runtime.test.ts` | `ModuleRuntime` durum makinesi |
| `bot-lifecycle.test.ts` | `start` / `stop`, rollback, temizlik |
| `command-sync.test.ts` | Discord komut kaydı |
| `installer.test.ts` | `install` / `update` transaction ve geri alma |
| `package-service.test.ts` | Güvenli spec, tarball okuma, `installInto` |
| `package-root.test.ts` | CLI shim, `--version`, build guard |
| `fs.test.ts` | BOM, JSONC, `setTopLevelValue` |
| `watcher.test.ts` | `dissora dev` izleme |
| `async.test.ts`, `colors.test.ts` | Yardımcılar |

Windows/Linux ayrımı için `mkdtemp` + `node:os` geçici klasörleri kullanılır.

## Derleme

```bash
npm run build
```

Üç ayrı `tsc` çalışması:

| Çıktı | tsconfig | `package.json` `type` |
| --- | --- | --- |
| `dist/cjs/` | `tsconfig.build.cjs.json` | `commonjs` (postbuild yazar) |
| `dist/esm/` | `tsconfig.build.esm.json` | `module` (postbuild yazar) |
| `dist/types/` | `tsconfig.build.types.json` | — |

`postbuild` ayrıca şunları doğrular ve eksikse **çıkış kodu 1** ile durur:

- `dist/cjs/index.js`, `dist/cjs/bin/dissora.js`
- `dist/esm/index.js`, `dist/esm/bin/dissora.js`
- `dist/types/index.d.ts`
- 8 şablon dosyası (`js/` ve `ts/` için `package.json`, `index`, `BotConfig.json`, `Modules/Ornek/moduleconfig.json`)

Şablonlar derlenmez; paket içinde `src/templates` olarak taşınır. Eksik
paketlenirse `dissora create` kullanıcı tarafında, uzakta ve hatası zor
anlaşılır şekilde patlar — bu yüzden burada erken yakalanır.

### Sürüm senkronu

```bash
npm version 2.1.0 --no-git-tag-version
npm run version:sync -- --write
```

`src/version.ts` `package.json` sürümüyle **el ile** senkron tutulur.
`version:sync` yalnızca tutarlılığı denetler; `--write` verilirse yazar.
Senkron değilse `build` başarısız olur:

```
[version] src/version.ts package.json ile eslesmiyor.
  package.json : 2.1.0
Duzeltmek icin:
  node scripts/sync-version.mjs --write
```

## Paketleme

`package.json` → `files`:

```json
["bin", "dist", "src/templates", "LICENSE", "README.md"]
```

Yani pakete yalnızca bunlar girer; `test/`, `scripts/`, `tsconfig*`,
`biome.json`, `.gitignore`, `build.bat` girmez. Doğrulamak için:

```bash
npm pack --dry-run --ignore-scripts
```

`npm install -g .` **kullanılmaz**: Windows'ta kaynak klasörü junction
olarak bağlar, `files` ve `prepack` hiç uygulanmaz; global kurulum kaynak
ağaçını (testler, tsconfig, `.gitignore` …) göstermeye devam eder.

### Windows: `build.bat`

```
1. npm install
2. npm run release     (lint + typecheck + build + test)
3. npm pack            → geçici klasöre dissora-<surum>.tgz
4. npm install -g <tarball>
5. dissora --version   → doğrulama
```

Her adım başarısız olursa betik durur, hangi adımın kırıldığını yazar ve
**yarım global kurulum yapmaz**.

### Yerel geliştirme döngüsü

```bash
npm run build
npm run link        # npm link + dissora --version doğrulaması
```

`npm run link`, `npm link` çıktısını doğrulamadan "bağlandı" demez;
`dissora --version`'ı gerçekten çalıştırır.

## Kod stili

- **Biome** biçimlendirici ve denetleyicisidir (`biome.json`).
- Kod ve yorumlar **diyakritiksiz ASCII Türkçedir** (`baslatilir`,
  `gorev`, `aciklama`). Kullanıcıya dönen CLI mesajları ve `docs/` ise
  gerçek Türkçe karakter kullanır.
- Türkçe yorumlarda tam cümle, neden'i açıklayan yorum yazılır; "ne
  yaptığını" tekrarlayan yorum yazılmaz.
- Token hiçbir çıktıda düz metin gösterilmez.
- Vitest'te `it()` imzası `it(name, options, fn)` — seçenekler **fn'den
  önce** gelir.

## Yayınlama (yayıncılar)

```bash
npm version 2.1.0 --no-git-tag-version
npm run version:sync -- --write
npm run release
npm pack --dry-run          # içerik kontrolü
npm publish                 # prepublishOnly release çalıştırır
```

npm hesabı iki adımlı doğrulama istiyorsa:

```bash
npm publish --otp=123456
```

Yayın sonrası doğrulama:

```bash
npm view dissora name version
npm install -g dissora@latest
dissora --version
```

## Katkı

1. Branch açın.
2. `npm run lint:fix && npm run typecheck` çalıştırın.
3. Değişikliği kapsayan test ekleyin.
4. `npm run release` yeşil olmalı.
5. PR açın; PR açıklamasında hangi davranışı değiştirdiğini ve nedenini
   yazın.

Hata raporlarken `dissora info` çıktısını ve log seviyesini `--log-level
debug` yaparak alın. Token'ı asla paylaşmayın.
