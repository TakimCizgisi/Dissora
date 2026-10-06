/**
 * `dissora module create <ad> [--ts]`
 *
 * Yalnizca modul klasorunu uretir: `moduleconfig.json`, giris noktasi ve
 * ornek `Command/`, `Event/`, `Always/` dosyalari. Proje sablonu
 * (`dissora create`) ile karistirilmamalidir.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { isSafeName } from "../config/module-config.js";
import { success } from "./utils.js";

export interface CreateModuleOptions {
    /** Modullerin bulundugu dizin (ornegin `<proje>/Modules`). */
    readonly modulesDir: string;
    readonly name: string;
    /** `null` ise proje diline gore tahmin edilir. */
    readonly typescript: boolean | null;
    /** Bir modulun bagimli oldugu diger moduller. */
    readonly requires?: readonly string[];
}

const EXT = ".js";

function safeName(name: string): string {
    if (!isSafeName(name)) {
        throw new Error(
            `Gecersiz modul adi: "${name}". Harf, rakam, nokta, _ ve - kullanabilirsin.`
        );
    }

    return name;
}

function moduleConfigTemplate(
    name: string,
    typescript: boolean,
    requires: readonly string[]
): string {
    const ext = typescript ? ".ts" : EXT;

    return `${JSON.stringify(
        {
            name,
            version: "1.0.0",
            description: `${name} modulu`,
            author: "",
            license: "MIT",
            main: `index${ext}`,
            enabled: true,
            requires,
            commands: {
                enabled: true
            },
            events: {
                enabled: true,
                files: [{ event: "ready", file: `Event/ready${ext}` }]
            },
            always: {
                enabled: false,
                tasks: []
            }
        },
        null,
        4
    )}\n`;
}

function indexTemplate(typescript: boolean): string {
    if (typescript) {
        return `import type { ModuleContext } from "dissora";

/**
 * Modul giris noktasi.
 *
 * \`init\`  -> dosyalar yuklenmeden once (bagimliliklar, konfigurasyon)
 * \`start\` -> komut/event/gorev dosyalari yuklendikten sonra
 */
export function init(context: ModuleContext): void {
    context.log.info(\`\${context.module} baslatiliyor\`);
}

export function start(context: ModuleContext): void {
    context.log.info(
        \`\${context.module} hazir: \${context.registry.commands.size} komut, \${context.registry.events.length} event\`
    );
}
`;
    }

    return `/**
 * Modul giris noktasi.
 *
 * \`init\`  -> dosyalar yuklenmeden once (bagimliliklar, konfigurasyon)
 * \`start\` -> komut/event/gorev dosyalari yuklendikten sonra
 */
module.exports = {
    init(context) {
        context.log.info(\`\${context.module} baslatiliyor\`);
    },

    start(context) {
        context.log.info(
            \`\${context.module} hazir: \${context.registry.commands.size} komut, \${context.registry.events.length} event\`
        );
    }
};
`;
}

function commandTemplate(typescript: boolean): string {
    if (typescript) {
        return `import { defineCommand } from "dissora";
import { SlashCommandBuilder } from "discord.js";

export default defineCommand({
    data: new SlashCommandBuilder()
        .setName("ornek")
        .setDescription("Ornek bir komut"),

    execute: async context => {
        await context.interaction.reply("Merhaba! Ben Dissora.");
    }
});
`;
    }

    return `const { defineCommand } = require("dissora");
const { SlashCommandBuilder } = require("discord.js");

/**
 * \`data.name\` ayni zamanda kayit anahtaridir; dosya adini degistirmen yeterli.
 */
module.exports = defineCommand({
    data: new SlashCommandBuilder()
        .setName("ornek")
        .setDescription("Ornek bir komut"),

    execute: async context => {
        await context.interaction.reply("Merhaba! Ben Dissora.");
    }
});
`;
}

function eventTemplate(typescript: boolean): string {
    if (typescript) {
        // Event dinleyicisi **ham discord.js argumanlarini** alir, `ModuleContext`
        // degil. `execute: async context => ...` yazimi tip denetimini kirardi
        // ve calisma zamaninda `context.log` undefined idi.
        return `import type { Client } from "discord.js";
import { defineEvent } from "dissora";

/**
 * Event dinleyicisi. Argumanlar dogrudan \`discord.js\`'ten gelir:
 * \`ready\` -> (client), \`interactionCreate\` -> (interaction, client).
 *
 * Modul bilgisi ve logger'a ihtiyacin varsa modulun \`index.ts\` dosyasindaki
 * \`init(context)\` icinde sakla.
 */
export default defineEvent("ready", (client: Client) => {
    console.log(\`\${client.user?.tag ?? "bilinmiyor"} hazir\`);
});
`;
    }

    return `const { defineEvent } = require("dissora");

/**
 * Event dinleyicisi. Argumanlar dogrudan \`discord.js\`'ten gelir:
 * \`ready\` -> (client), \`interactionCreate\` -> (interaction, client).
 */
module.exports = defineEvent("ready", client => {
    console.log(\`\${client.user?.tag ?? "bilinmiyor"} hazir\`);
});
`;
}

function readmeTemplate(name: string): string {
    return `# ${name}

\`dissora module create\` ile olusturuldu.

## Yapilandirma

- \`moduleconfig.json\`: modul tanimi, bagimliliklar (\`requires\`), komut/event/gorev kayitlari
- \`Command/\`: \`commands.files\` verilmezse otomatik taranir
- \`Event/\`: \`events.files\` icinde hangi event'e baglanacagi yazilir
- \`Always/\`: \`always.tasks\` icinde \`interval\` (ms) zorunludur

## Kontrol

\`\`\`bash
npx dissora module info ${name}
npx dissora module disable ${name}
\`\`\`
`;
}

/**
 * Projenin dilini tahmin eder.
 *
 * `--ts` / `--js` verilmediyse mevcut modullerin giris dosyalarina ve
 * proje kokundeki `tsconfig.json` dosyasina bakilir; boylece bir TS
 * projesinde yanlislikla JS modul uretilmez.
 */
export function detectProjectTypescript(modulesDir: string): boolean {
    try {
        for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }

            if (existsSync(resolve(modulesDir, entry.name, "index.ts"))) {
                return true;
            }

            if (existsSync(resolve(modulesDir, entry.name, "index.js"))) {
                return false;
            }
        }
    } catch {
        // dizin yoksa proje kokune bakilir
    }

    return existsSync(resolve(modulesDir, "..", "tsconfig.json"));
}

/** Modullerin bulundugu dizine yeni bir modul yazar. Klasorun yolunu dondurur. */
export async function createModule(
    options: CreateModuleOptions
): Promise<string> {
    const name = safeName(options.name);
    const target = resolve(options.modulesDir, name);
    const typescript =
        options.typescript ?? detectProjectTypescript(options.modulesDir);

    if (existsSync(target)) {
        throw new Error(`"${name}" zaten var: ${target}`);
    }

    const requires = options.requires ?? [];

    for (const dependency of requires) {
        safeName(dependency);
    }

    if (requires.includes(name)) {
        throw new Error(`Modul kendine bagli olamaz: ${name}`);
    }

    mkdirSync(resolve(target, "Command"), { recursive: true });
    mkdirSync(resolve(target, "Event"), { recursive: true });

    const scriptExt = typescript ? ".ts" : EXT;

    writeFileSync(
        resolve(target, "moduleconfig.json"),
        moduleConfigTemplate(name, typescript, [...requires]),
        "utf8"
    );
    writeFileSync(
        resolve(target, `index${scriptExt}`),
        indexTemplate(typescript),
        "utf8"
    );
    writeFileSync(
        resolve(target, "Command", `ornek${scriptExt}`),
        commandTemplate(typescript),
        "utf8"
    );
    writeFileSync(
        resolve(target, "Event", `ready${scriptExt}`),
        eventTemplate(typescript),
        "utf8"
    );
    writeFileSync(resolve(target, "README.md"), readmeTemplate(name), "utf8");

    success(`${name} modulu olusturuldu: ${target}`);

    return target;
}
