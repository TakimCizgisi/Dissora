# Dissora Dokümantasyonu

Dissora; bağımlılık çözümleyen, sıralı yükleyen, izole hata yönetimi olan ve
temiz kapanış garantisi veren, TypeScript ile yazılmış modüler Discord bot
framework'ü ve modül yöneticisidir.

| | |
| --- | --- |
| Sürüm | `2.0.0` |
| Node | `>=20` |
| Lisans | MIT |
| npm | [`dissora`](https://www.npmjs.com/package/dissora) |
| Kaynak | [github.com/TakimCizgisi/Dissora](https://github.com/TakimCizgisi/Dissora) |

## Dokümanlar

| Doküman | Ne anlatır |
| --- | --- |
| [Hızlı başlangıç](getting-started.md) | Kurulum, üretilen proje yapısı, ilk çalıştırma, bot yaşam döngüsü |
| [CLI referansı](cli.md) | Tüm komutlar, alt komutlar, bayraklar ve alias'lar |
| [Modül sistemi](modules.md) | `moduleconfig.json` şeması, dosya keşfi, bağımlılıklar, hata izolasyonu, `install` / `update` / `remove` |
| [Modül API'si](module-api.md) | `defineCommand` / `defineEvent` / `defineAlways`, `ModuleContext`, `CommandContext`, `init` / `start` |
| [Yapılandırma](config.md) | Katman sırası, `BotConfig.json` şeması, `.env` ve ortam değişkenleri |
| [Public API](api.md) | `dissora` paketinin dışa aktardığı tüm tipler ve fonksiyonlar |
| [Geliştirme](development.md) | Test, lint, build, release, paketleme ve katkı akışı |

## En kısa yol

```bash
npx dissora create my-bot --ts
cd my-bot
npm install
npm run dev
```

## Dokümantasyon ilkeleri

- Her örnek bu depoda çalışan koddur; `test/` altındaki 313 test bunları korur.
- Kod ve yorumlar diyakritiksiz ASCII Türkçedir (`baslatilir`, `gorev`,
  `aciklama`); kullanıcıya dönen CLI mesajları ve bu dokümanlar gerçek
  Türkçe karakter kullanır.
- Bir davranış bu dokümanlarla kaynak arasında çelişirse kaynak doğrudur;
  lütfen bir issue açın.
