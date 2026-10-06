/**
 * `dissora create <ad> [--ts|--js]`
 *
 * Calisma icin hazir bir bot projesi uretir. Varsayilan JavaScript,
 * `--ts` ile TypeScript sablonu kullanilir.
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { readJsonFile } from "../utils/fs.js";
import { packageRoot, packageVersion } from "../utils/root.js";
import { requireSafeName, success } from "./utils.js";

export interface CreateOptions {
    readonly projectPath: string;
    readonly name: string;
    readonly typescript: boolean;
}

function templateDir(typescript: boolean): string {
    return resolve(packageRoot(), "src", "templates", typescript ? "ts" : "js");
}

function envTemplate(typescript: boolean): string {
    const run = typescript ? "npx tsx index.ts" : "node index.js";

    return `# Bot token (Discord Developer Portal > Bot > Token)
DISSORA_TOKEN=

# Guild modu icin sunucu ID. Bos birakirsen veya "all" yazarsan
# komut kaydi global olur.
DISSORA_GUILD_ID=all

# Modul klasoru (varsayilan: Modules)
# DISSORA_MODULES_DIR=Modules

# Gunluk seviyesi: trace | debug | info | warn | error | silent
# DISSORA_LOG_LEVEL=info
# DISSORA_LOG_TIMESTAMPS=false

# Komut kaydi: auto | guild | global
# DISSORA_COMMAND_SCOPE=auto
# Discord'da kalmis ama dosyada olmayan komutlar silinsin mi?
# DISSORA_PRUNE_STALE=true

# Bot gorunumu
# DISSORA_BOT_NAME=Botum
# DISSORA_STATUS=online
# DISSORA_ACTIVITY_TYPE=watching
# DISSORA_ACTIVITY_NAME=Dissora

# Virgulle ayrilmis intent listesi
# DISSORA_INTENTS=Guilds,GuildMessages

# Virgulle ayrilmis bot sahipleri (Discord kullanici ID)
# DISSORA_OWNERS=

# Renkleri kapat (terminal desteklemiyorsa)
# DISSORA_NO_COLOR=1

# Not: Botu "npx dissora start" ile calistir.
# Dogrudan calistirmak icin: ${run}
`;
}

function gitignoreTemplate(): string {
    return `node_modules/
.env
*.log
.DS_Store
Modules/*/.dissora-backup
`;
}

function readmeTemplate(name: string, typescript: boolean): string {
    const run = typescript ? "npx tsx index.ts" : "node index.js";

    return `# ${name}

Dissora ile olusturuldu (v${packageVersion()}).

## Kurulum

\`\`\`bash
npm install
\`\`\`

## Calistirma

\`\`\`bash
npx dissora start
# gelistirme modu (Modules/ izlenir, degisince yeniden baslar)
npx dissora dev
# veya dogrudan:
${run}
\`\`\`

## Yapilandirma

- \`.env\` -> token ve ortam degiskenleri
- \`BotConfig.json\` -> bot davranisi (ad, durum, intent, komut kapsami)
- \`Modules/<Modul>/moduleconfig.json\` -> modul tanimi

Yapilandirmayi incelemek icin:

\`\`\`bash
npx dissora config show
npx dissora config validate
\`\`\`

## Modul ekleme

\`\`\`bash
npx dissora module create Ekonomi
\`\`\`

Modul dosyalari \`Modules/Ekonomi/\` altinda olusur. Yeni modul eklendikten
sonra \`npx dissora dev\` otomatik yeniden baslar.
`;
}

/**
 * Projeyi olusturur.
 *
 * Hata halinde **yarim kurulum birakilmaz**: uretilen klasor tamamen
 * silinir. Aksi halde kullanici "dissora create tekrar calistir" dediginde
 * `"ad" zaten var` hatasi alir ve elle temizlemek gerekir.
 */
export async function createProject(options: CreateOptions): Promise<string> {
    const name = requireSafeName(options.name, "proje adi");
    const target = resolve(options.projectPath, name);

    if (existsSync(target)) {
        throw new Error(
            `"${name}" zaten var. Farkli bir ad sec ya da klasoru sil.`
        );
    }

    const source = templateDir(options.typescript);

    if (!existsSync(source)) {
        throw new Error(`Sablon bulunamadi: ${source}`);
    }

    try {
        mkdirSync(target, { recursive: true });
        cpSync(source, target, { recursive: true });

        writeFileSync(
            resolve(target, ".env"),
            envTemplate(options.typescript),
            "utf8"
        );
        writeFileSync(
            resolve(target, ".gitignore"),
            gitignoreTemplate(),
            "utf8"
        );
        writeFileSync(
            resolve(target, "README.md"),
            readmeTemplate(name, options.typescript),
            "utf8"
        );

        patchPackageJson(target, name, options.typescript);
    } catch (error) {
        // Yarim klasoru temizle: kullanici ayni adla tekrar deneyebilsin.
        rmSync(target, { recursive: true, force: true });

        throw error;
    }

    success(`${name} olusturuldu: ${target}`);
    success(`Sonraki adimlar: cd ${name} && npm install && npx dissora start`);

    return target;
}

/**
 * Sablonun `package.json` dosyasini hazirlar.
 *
 * Kritik nokta: `dissora` bagimliligi sablon icinde `^1.0.0` yaziyor.
 * Calisan CLI surumu farkliysa (ornegin `2.3.0`) npm eskisini kurar ve
 * kullanici CLI ile uyumsuz bir framework ile karsilasir. Bu yuzden
 * surum **calisan pakete gore** yazilir.
 */
function patchPackageJson(
    target: string,
    name: string,
    typescript: boolean
): void {
    const pkgPath = resolve(target, "package.json");
    const pkg = readJsonFile(pkgPath) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        dissora?: { template?: string };
    };

    pkg.name = name;
    pkg.dissora = { template: typescript ? "ts" : "js" };

    const version = packageVersion();
    const range = `^${version}`;

    // Sablonda hangi bolumde dursa orada guncelleyelim.
    const bucket =
        pkg.dependencies?.dissora === undefined
            ? pkg.devDependencies
            : pkg.dependencies;

    if (bucket) {
        bucket.dissora = range;
    } else {
        pkg.dependencies = { ...(pkg.dependencies ?? {}), dissora: range };
    }

    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`, "utf8");
}
