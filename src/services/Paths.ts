import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { isSafeName } from "../config/module-config.js";

/**
 * Proje icindeki tum yollari tek noktadan uretir.
 *
 * `resolveInside` ayrica modul klasoru gibi kullanici girdisi olan yollarin
 * proje kokunun disina cikmasini engeller (path traversal korumasi).
 */
export class ProjectPaths {
    readonly root: string;

    constructor(projectPath: string) {
        this.root = resolve(projectPath);
    }

    get botConfigFile(): string {
        return resolve(this.root, "BotConfig.json");
    }

    get envFile(): string {
        return resolve(this.root, ".env");
    }

    get packageFile(): string {
        return resolve(this.root, "package.json");
    }

    hasBotConfig(): boolean {
        return existsSync(this.botConfigFile);
    }

    /**
     * Proje kokune gore goreli bir yolu mutlak yola cevirir.
     * Klasor disina cikmaya calisan yollar reddedilir.
     */
    resolveInside(relativePath: string): string {
        const target = isAbsolute(relativePath)
            ? resolve(relativePath)
            : resolve(this.root, relativePath);

        const rel = relative(this.root, target);

        if (rel === "") {
            return target;
        }

        if (rel.startsWith("..") || isAbsolute(rel)) {
            throw new Error(
                `Guvenli olmayan yol: "${relativePath}" proje kokunun disinda.`
            );
        }

        return target;
    }

    /** Modul klasorunu guvenli sekilde cozer. */
    module(name: string, modulesDirName = "Modules"): string {
        if (!isSafeName(name)) {
            throw new Error(
                `Gecersiz modul adi: "${name}". Yalnizca harf, rakam, nokta, _ ve - kullanilabilir.`
            );
        }

        return this.resolveInside(joinRelative(modulesDirName, name));
    }

    modulesDirNameFor(modulesDir: string): string {
        return modulesDir;
    }

    get modulesDir(): string {
        return resolve(this.root, "Modules");
    }

    modulesDirFor(modulesDirName: string): string {
        return this.resolveInside(modulesDirName);
    }

    moduleConfig(name: string, modulesDirName = "Modules"): string {
        return resolve(this.module(name, modulesDirName), "moduleconfig.json");
    }

    /** `dissora install` yazdigi kurulum kaydi. */
    moduleRecord(name: string, modulesDirName = "Modules"): string {
        return resolve(this.module(name, modulesDirName), ".dissora.json");
    }

    relative(target: string): string {
        const rel = relative(this.root, resolve(target));

        return rel === "" ? "." : rel.split(sep).join("/");
    }
}

export function joinRelative(base: string, child: string): string {
    return base === "" ? child : `${base}/${child}`;
}
