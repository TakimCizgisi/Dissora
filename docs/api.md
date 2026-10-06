# Public API

`dissora` paketi bot tarafını, modül tarafını ve yardımcıları dışa aktarır.
Hem CommonJS (`require`) hem ESM (`import`) desteklenir; tipler
`dist/types/index.d.ts` üzerinden gelir.

```ts
import {
    DissoraBot,
    defineCommand,
    defineEvent,
    defineAlways
} from "dissora";

import type { ModuleContext, CommandContext } from "dissora";
```

Paket sürümü:

```ts
import { VERSION } from "dissora";   // "2.0.0"
```

## Bot

| Export | Tür |
| --- | --- |
| `DissoraBot` | sınıf |
| `BotOptions` | arayüz |
| `BotState` | `"idle" \| "loading" \| "connecting" \| "ready" \| "stopping" \| "stopped"` |

### `DissoraBot`

```ts
new DissoraBot(projectPath: string, options?: BotOptions)
```

| Üye | Açıklama |
| --- | --- |
| `paths: ProjectPaths` | Proje yolları |
| `logger: Logger` | Kök logger |
| `registry: Registry` | Kayıtlı komut / event / handler'lar |
| `timers: TimerRegistry` | Aktif zamanlayıcılar |
| `modules: Map<string, ModuleRuntime>` | Modül durumları |
| `config: ResolvedConfig` | Çözümlenmiş yapılandırma |
| `dissora: DissoraClient` | Modüllere verilen servis arayüzü |
| `client: Client \| null` | `discord.js` client (bağlantıdan önce `null`) |
| `state` | Geçerli `BotState` |
| `isReady` | `state === "ready"` |
| `summary()` | `{ state, total, loaded, skipped, failed, commands, events, timers, uptime }` |
| `planModules()` | Bağımlılık planını hesaplar |
| `syncCommands()` | `Promise<SyncReport>` |
| `start()` | `Promise<void>` — config → modüller → login → komut kaydı |
| `stop(reason?)` | `Promise<void>` — temizlik; **süreci sonlandırmaz** |
| `restart()` | `Promise<void>` |
| `onDispose(disposer)` | Kapanışta çalışacak temizlik |

`BotOptions`: `clientFactory`, `clientOptions`, `logger`, `logLevel`,
`overrides`, `registerCommands`, `exitOnShutdown`, `env`, `skipDotenv`,
`hooks.onReady`.

## Modül tanımları

| Export | Açıklama |
| --- | --- |
| `defineCommand(command)` | Kimlik fonksiyonu; `execute` zorunlu |
| `defineEvent(event, execute, options?)` | Kısa biçim |
| `defineEvent(definition)` | `{ event, execute, once? }` |
| `defineAlways(execute, options?)` | Fonksiyon + `{ interval?, runOnStart?, name? }` |
| `defineAlways(definition)` | `{ interval?, runOnStart?, name?, execute }` |

Hatalı giriş `TypeError` fırlatır:

```
defineCommand: execute fonksiyonu gerekli
defineEvent: event adi gerekli
defineAlways: interval gerekli
```

## Tipler

### Modül sistemi

| Tip | Açıklama |
| --- | --- |
| `ModuleContext` | `init` / `start` / `defineAlways.execute` girdisi |
| `ModuleExports` | `{ init?, start? }` |
| `CommandModule`, `EventModule`, `AlwaysModule` | Dosya export'u şekilleri |
| `CommandContext` | `defineCommand.execute` girdisi |
| `CommandData` | `SlashCommandBuilder \| JSON \| { toJSON() }` |
| `CommandPayload` | `RESTPostAPIApplicationCommandsJSONBody` |
| `CommandExecutor` | `(context: CommandContext) => unknown \| Promise<unknown>` |
| `Disposer` | `() => unknown \| Promise<unknown>` |
| `ClientEvents` | `discord.js` olay haritası |
| `Client` | `discord.js` `Client` |

### Yapılandırma

| Tip | Açıklama |
| --- | --- |
| `BotConfig`, `BotActivityConfig`, `BotCommandsConfig`, `BotLoggingConfig` | `BotConfig.json` şeması |
| `BotStatus`, `CommandScope` | Değer tipleri |
| `ModuleConfig`, `ModuleCommandEntry`, `ModuleEventEntry`, `ModuleAlwaysEntry` | `moduleconfig.json` şeması |
| `ConfigLayer`, `ConfigSnapshot`, `ResolvedConfig` | Katman çözümleme |
| `ConfigIssue` | `{ path, message }` |
| `ConfigError` | `issues` taşıyan hata sınıfı |

### Çekirdek

| Export | Açıklama |
| --- | --- |
| `ModuleHost` | Tek modulü yükler, hata izolasyonunu sağlar |
| `Registry` | Kayıt ve rollback |
| `RegisteredCommand`, `RegisteredEvent`, `TrackedHandler`, `BindingEmitter` | Registry tipleri |
| `TimerRegistry`, `TimerHandle`, `ActiveTimer` | Zamanlayıcılar |
| `Shutdown`, `ShutdownReason` | Ortak kapanış |
| `ModuleRuntime`, `ModuleState` | Modül çalışma zamanı durumu |
| `createModuleRuntime(input)` | `ModuleRuntime` üretici |
| `resolveModulePlan(candidates)` | `DependencyPlan` — sıralama, `skipped`, `errors` |
| `DependencyPlan`, `ModuleCandidate`, `ModulePlanEntry` | Plan tipleri |
| `createDissoraClient(deps)`, `DissoraClient`, `ModuleDirectory` | Modüllere verilen servis |

### Loader'lar

| Export | Açıklama |
| --- | --- |
| `LOADERS` | `[CommandLoader, EventLoader, AlwaysLoader]` sırası |
| `CommandLoader`, `EventLoader`, `AlwaysLoader` | Sınıflar |
| `loaderNames()` | Loader adları |
| `isValidCommandName(name)` | `^[-_\p{L}\p{N}]{1,32}$` denetimi |
| `Loader`, `LoaderContext` | Genişletme arayüzleri |
| `LoaderError` | `{ loader, message, source? }` taşıyan hata |

### Komut senkronizasyonu

| Export | Açıklama |
| --- | --- |
| `syncCommands(app, commands, options)` | Discord'a komut kaydeder |
| `SyncOptions`, `SyncReport`, `SyncScope` | Tipler |

### Yardımcılar

**Loglama** — `Logger`, `createLogger`, `isLogLevel`, `LogLevel`,
`LoggerOptions`.

**Yollar** — `ProjectPaths` (`root`, `botConfigFile`, `envFile`,
`packageFile`, `modulesDir`, `module(name)`, `moduleConfig(name)`,
`moduleRecord(name)`).

**İzleme** — `watchTree(path, options)`, `WatchHandle`, `WatchOptions`
(`dissora dev` bunu kullanır).

**Renk** — `createStyler`, `getStyler`, `detectColorSupport`,
`setColorSupport`, `hexToRgb`, `rgbToHex`, `mixColor`, `stripAnsi`,
`ColorSupport`, `ColorDepth`, `Rgb`.

**Marka** — `DISSORA_LOGO`, `BRAND_GRADIENT`, `renderDissoraLogo`,
`renderBanner`, `tagColorFor`, `MODULE_TAG_COLORS`, `PALETTE`.

**Paket servisi** — `VERSION`.

> Bot tarafı dışa aktarımları ile modül tarafı arasında ayrım vardır:
> `define*` ve `ModuleContext` modül dosyalarında kullanılır; `DissoraBot`
> yalnızca giriş noktasında (`index.ts`) kullanılır.

## Genişletme

Loader eklemek `Loader` arayüzünü uygulayıp `LOADERS` dizisine eklemekle
mümkündür; `LoaderContext` mevcut servisleri (`client`, `logger`, `registry`,
`timers`, `paths`, `resolved`, `runtime`, `moduleContext`) sağlar.

Bkz. [Modül API'si](module-api.md).
