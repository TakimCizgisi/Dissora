/**
 * Config dogrulama hatalari.
 *
 * Butun config dosyalari (BotConfig.json, moduleconfig.json, .env) ayni
 * hat bicimini kullanir: kaynak + JSON yolu + ne oldu.
 */

export interface ConfigIssue {
    readonly path: string;
    readonly message: string;
}

export class ConfigError extends Error {
    readonly source: string;

    readonly issues: readonly ConfigIssue[];

    constructor(source: string, issues: readonly ConfigIssue[]) {
        const detail = issues
            .map(issue => `  - ${issue.path}: ${issue.message}`)
            .join("\n");

        super(
            issues.length === 1
                ? `${source}: ${detail.trim()}`
                : `${source}\n${detail}`
        );

        this.name = "ConfigError";
        this.source = source;
        this.issues = issues;
    }
}

export function issue(path: string, message: string): ConfigIssue {
    return { path, message };
}

export function isPlainObject(
    value: unknown
): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Opsiyonel string okur.
 *
 * `undefined` / `null` sessizce `null` doner; boylece
 * `asString(raw.x, ...) ?? varsayilan` deseni calisir. Ancak alan yazilmissa
 * string degilse hata bildirilir.
 */
export function asString(
    value: unknown,
    path: string,
    issues: ConfigIssue[]
): string | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();

        return trimmed === "" ? null : trimmed;
    }

    issues.push(issue(path, "string olmali"));

    return null;
}

/**
 * Zorunlu string okur: alan yoksa, bossa veya string degilse hata bildirir.
 */
export function asRequiredString(
    value: unknown,
    path: string,
    issues: ConfigIssue[]
): string | null {
    if (value === undefined || value === null) {
        issues.push(issue(path, "string olmali (bos olamaz)"));

        return null;
    }

    return asString(value, path, issues);
}

export function asOptionalString(
    value: unknown,
    path: string,
    issues: ConfigIssue[]
): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    const result = asString(value, path, issues);

    return result === null ? undefined : result;
}

export function asBoolean(
    value: unknown,
    path: string,
    issues: ConfigIssue[],
    fallback: boolean
): boolean {
    if (value === undefined || value === null) {
        return fallback;
    }

    if (typeof value === "boolean") {
        return value;
    }

    if (value === "true") {
        return true;
    }

    if (value === "false") {
        return false;
    }

    issues.push(issue(path, "boolean olmali (true/false)"));

    return fallback;
}

export function asNumber(
    value: unknown,
    path: string,
    issues: ConfigIssue[],
    fallback: number
): number {
    if (value === undefined || value === null) {
        return fallback;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);

        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    issues.push(issue(path, "sayi olmali"));

    return fallback;
}

export function asStringArray(
    value: unknown,
    path: string,
    issues: ConfigIssue[]
): string[] {
    if (value === undefined || value === null) {
        return [];
    }

    if (!Array.isArray(value)) {
        issues.push(issue(path, "string dizisi olmali"));

        return [];
    }

    const out: string[] = [];

    for (let index = 0; index < value.length; index++) {
        const entry = value[index];

        if (typeof entry === "string" && entry.trim() !== "") {
            out.push(entry.trim());
            continue;
        }

        issues.push(issue(`${path}[${index}]`, "string olmali"));
    }

    return out;
}

export function asOneOf<T extends string>(
    value: unknown,
    path: string,
    allowed: readonly T[],
    issues: ConfigIssue[],
    fallback: T
): T {
    if (value === undefined || value === null) {
        return fallback;
    }

    if (typeof value === "string") {
        const lower = value.trim().toLowerCase();
        const found = allowed.find(entry => entry === lower);

        if (found !== undefined) {
            return found;
        }

        issues.push(
            issue(
                path,
                `"${value}" gecersiz. Izin verilenler: ${allowed.join(", ")}`
            )
        );

        return fallback;
    }

    issues.push(issue(path, "string olmali"));

    return fallback;
}

export function throwIfInvalid(
    source: string,
    issues: readonly ConfigIssue[]
): void {
    if (issues.length > 0) {
        throw new ConfigError(source, issues);
    }
}
