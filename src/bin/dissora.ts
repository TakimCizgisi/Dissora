#!/usr/bin/env node

/**
 * `dissora` CLI giris noktasi.
 *
 * Alt komutlar:
 *   start              botu baslat
 *   dev                gelistirme modu (izleme + yeniden baslatma)
 *   create <ad> [--ts|--js] hazir proje olustur
 *   module <alt> ...   modul yonetimi
 *   install <paket>    npm paketinden (ya da .tgz) modul kur
 *   update [modul]     modul guncelle
 *   remove <modul>     modul kaldir
 *   info               tanilama ozeti
 *   config <alt> ...   yapilandirma yonetimi
 *   --version, --help
 */

import { configCommand } from "../cli/config.js";
import { createProject } from "../cli/create.js";
import { devCommand, resolveDevOptions } from "../cli/dev.js";
import { runInfo } from "../cli/info.js";
import { moduleCommand } from "../cli/module.js";
import {
    installCommand,
    removeCommand,
    updateCommand
} from "../cli/package.js";
import { resolveStartOptions, startCommand } from "../cli/start.js";
import {
    flagBool,
    out,
    type ParsedArgs,
    parseArgs,
    reportError
} from "../cli/utils.js";
import { renderDissoraLogo, renderLshLogo } from "../utils/branding.js";
import { detectColorSupport, setColorSupport } from "../utils/colors.js";
import { VERSION } from "../version.js";

/**
 * Yardim metni.
 *
 * Fonksiyon olmasi onemli: renk desteği bayraklardan sonra uygulandigi icin
 * sabit bir modul seviyesi metin `--no-color --help` ile boyanamazdi.
 */
function helpText(): string {
    return `
${renderDissoraLogo()}
${renderLshLogo()}  v${VERSION}

Kullanim
  dissora <komut> [secenekler]

Komutlar
  start                       botu baslatir
  dev                         gelistirme modu: Modules/ izlenir, degisince yeniden baslar
  create <ad> [--ts|--js]     calisma icin hazir proje olusturur (varsayilan: JavaScript)
  module list                 kurulu moduller
  module create <ad> [sec.]   yeni modul sablonu (--ts | --js | --requires A,B)
  module enable|disable <ad>  modul acma/kapatma
  module info <ad>            modul ayrintisi
  install <paket> [--force]   npm paketinden (ya da .tgz) modul kurar
  update [modul] [<paket>]    gunceller (isim verilmezse tum kurulu moduller)
  remove <modul>              modulu siler
  info                        tanilama ozeti
  config show|path|validate   yapilandirma
  config get <anahtar>        tek degeri okur
  config set <anahtar> <d>    degeri yazar (BotConfig.json veya .env)

Secenekler
  --log-level <seviye>   trace | debug | info | warn | error | silent
  --no-banner            banner'i bastirma
  --sync                 dev modunda global komut kaydini da yap
  --no-sync              komut kaydini tamamen kapat
  --no-color             renkleri kapat
  --force                install/update: yerel modulu ez
  --version, --help      (-v, -h)

Ornekler
  dissora create my-bot --ts
  dissora module create Ekonomi --requires Log
  dissora config set logging.level debug
  dissora install @dissora/economy
`;
}

function applyColorFlags(args: ParsedArgs): void {
    if (flagBool(args, "no-color")) {
        setColorSupport({ enabled: false, depth: 0 });

        return;
    }

    setColorSupport(detectColorSupport());
}

/**
 * `null` donerse bot kendi kapanmasini yonetiyor; CLI cikis kodu
 * uygulamaz ve surec bot tarafindan sonlandirilir.
 */
export async function main(argv: readonly string[]): Promise<number | null> {
    const args = parseArgs(argv);
    const command = args.positionals[0];
    const rest = args.positionals.slice(1);

    // Renk karari bayraklardan okundugu icin help ciktisindan once uygulanir.
    applyColorFlags(args);

    if (flagBool(args, "help")) {
        out(helpText());

        return 0;
    }

    if (flagBool(args, "version")) {
        out(VERSION);

        return 0;
    }

    switch (command) {
        case "start":
        case undefined:
            await startCommand(resolveStartOptions(process.cwd(), args));

            return null;

        case "dev":
        case "watch":
            await devCommand(resolveDevOptions(process.cwd(), args));

            return null;

        case "create":
        case "new": {
            if (rest[0] === undefined) {
                out("kullanim: dissora create <ad> [--ts|--js]");

                return 1;
            }

            await createProject({
                projectPath: process.cwd(),
                name: rest[0],
                typescript: flagBool(args, "ts")
            });

            return 0;
        }

        case "module":
        case "mod":
            return moduleCommand(process.cwd(), rest);

        case "install":
        case "i":
        case "add":
            return installCommand(process.cwd(), rest);

        case "update":
        case "upgrade":
            return updateCommand(process.cwd(), rest);

        case "remove":
        case "rm":
        case "uninstall":
            return removeCommand(process.cwd(), rest);

        case "info":
        case "doctor":
        case "status":
            return runInfo(process.cwd());

        case "config":
            return configCommand(process.cwd(), rest);

        case "help":
            out(helpText());

            return 0;

        default:
            out(`bilinmeyen komut: ${command}`);
            out("yardim icin: dissora --help");

            return 1;
    }
}

/** `null` = surec bot tarafindan yonetiliyor (cikis kodu kullanma). */
async function run(): Promise<void> {
    try {
        const code = await main(process.argv.slice(2));

        if (code !== null) {
            process.exitCode = code;
        }
    } catch (error) {
        reportError(error);
        process.exitCode = 1;
    }
}

void run();
