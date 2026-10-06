import { existsSync, readFileSync } from "node:fs";

/**
 * `.env` dosyasini basit bir anahtar=deger okuyucu ile okur.
 *
 * Desteklenenler: bos satirlar, `#` yorumlari, `export ` oneki,
 * tek ve cift tirnakli degerler.
 */
export function readEnvFile(file: string): Record<string, string | null> {
    const values: Record<string, string | null> = {};

    if (!existsSync(file)) {
        return values;
    }

    const text = readFileSync(file, "utf8");

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();

        if (line === "" || line.startsWith("#")) {
            continue;
        }

        const withoutExport = line.startsWith("export ")
            ? line.slice("export ".length).trim()
            : line;

        const separator = withoutExport.indexOf("=");

        if (separator <= 0) {
            continue;
        }

        const key = withoutExport.slice(0, separator).trim();
        let value = withoutExport.slice(separator + 1).trim();

        const quoted =
            value.length > 1 &&
            ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'")));

        if (quoted) {
            value = value.slice(1, -1);
        }

        values[key] = value;
    }

    return values;
}
