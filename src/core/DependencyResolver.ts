import type { ModuleConfig } from "../config/module-config.js";

/** Bagimlilik cozumlemesine giren ham modul kaydi. */
export interface ModuleCandidate {
    /** Klasor adi (benzersiz). */
    readonly name: string;
    /** Config okunamadiysa null; boyle durumlar hata olarak isaretlenir. */
    readonly config: ModuleConfig | null;
    /** Config dogrulama hatasi. */
    readonly error: Error | null;
}

export interface ModulePlanEntry {
    readonly name: string;
    readonly config: ModuleConfig;
}

export interface SkippedModule {
    readonly name: string;
    readonly reason: string;
}

export interface DependencyPlan {
    /** Yukleme sirasi. */
    readonly order: ModulePlanEntry[];
    /** Bagimlilik nedeniyle yuklenmeyenler. */
    readonly skipped: SkippedModule[];
    /** Duzeltilemeyen hatalar (dongu, bozuk config). */
    readonly errors: SkippedModule[];
}

/**
 * `moduleconfig.json` icindeki `requires` alanina gore yukleme sirasi
 * cikarir (topolojik siralama).
 *
 * - Eksik veya `enabled: false` bir bagimlilik varsa bagli modul `skipped`
 *   olur; bot calismaya devam eder.
 * - Donguler `errors` icinde, okunabilir bir yol olarak raporlanir.
 */
export function resolveModulePlan(
    candidates: readonly ModuleCandidate[]
): DependencyPlan {
    const order: ModulePlanEntry[] = [];
    const skipped: SkippedModule[] = [];
    const errors: SkippedModule[] = [];

    /**
     * Anahtar normalizasyonu.
     *
     * `moduleconfig.json` `requires` alanini elle yazan kullanici `"log"`
     * yazarken klasor `Log` olabilir; onceki kod birebir esitlik arardi ve
     * bagimlilik "bulunamadi" diye modul yanlis atilirdi.
     */
    const keyOf = (name: string): string => name.trim().toLowerCase();

    const byName = new Map<string, ModuleCandidate>();

    for (const candidate of candidates) {
        byName.set(keyOf(candidate.name), candidate);
    }

    /** Klasor adinin gercek yazimini dondurur (varsa). */
    const realNameOf = (name: string): string | undefined =>
        byName.get(keyOf(name))?.name;

    const names = [...candidates]
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b));

    type Status = "ok" | "skip" | "error";

    const visited = new Map<string, Status>();
    /** Su an cozumlenmekte olan cerceveler (yol = bagimlilik zinciri). */
    const stack: string[] = [];

    const addError = (name: string, reason: string): void => {
        if (
            !errors.some(
                entry => entry.name === name && entry.reason === reason
            )
        ) {
            errors.push({ name, reason });
        }
    };

    const addSkip = (name: string, reason: string): void => {
        if (!skipped.some(entry => entry.name === name)) {
            skipped.push({ name, reason });
        }
    };

    /**
     * Dongu tespiti.
     *
     * Onceki kod dongu bulundugunda `stack.pop()` ile ustteki dugumu
     * atiyordu; bu, dongunun geri kalani icin yanlis cerceve birakiyor ve
     * ilgisiz modullere de "dongu" hatasi yaziliyordu.
     */
    const visit = (rawName: string): Status => {
        const key = keyOf(rawName);
        const cached = visited.get(key);

        if (cached !== undefined) {
            return cached;
        }

        const name = realNameOf(rawName) ?? rawName;

        const frame = stack.indexOf(key);

        if (frame !== -1) {
            const cycle = [...stack.slice(frame), key].join(" -> ");

            for (const member of stack.slice(frame)) {
                addError(member, `bagimlilik dongusu: ${cycle}`);
            }

            addError(name, `bagimlilik dongusu: ${cycle}`);

            // Dongudaki tum uyeler hatali isaretlenir; cagri yigini
            // kirilmaz, ust cerceveler kendi kararlarini verebilir.
            for (const member of stack.slice(frame)) {
                visited.set(member, "error");
            }

            visited.set(key, "error");

            return "error";
        }

        const candidate = byName.get(key);

        if (candidate === undefined) {
            // `requires` ile atlanan bir modul: isim hatasi yok, sadece
            // bagimli modul atlanir.
            return "error";
        }

        if (candidate.error !== null || candidate.config === null) {
            addError(
                candidate.name,
                candidate.error?.message ?? "moduleconfig.json okunamadi"
            );
            visited.set(key, "error");

            return "error";
        }

        const config = candidate.config;

        if (!config.enabled) {
            addSkip(candidate.name, "modul devre disi (enabled: false)");
            visited.set(key, "skip");

            return "skip";
        }

        stack.push(key);

        let result: Status = "ok";

        for (const dependency of config.requires) {
            const status = visit(dependency);

            if (status === "error") {
                const real = realNameOf(dependency) ?? dependency;

                addError(candidate.name, `bagimlilik yuklenemedi: ${real}`);
                result = "error";
                break;
            }

            if (status === "skip") {
                const real = realNameOf(dependency) ?? dependency;

                addSkip(candidate.name, `bagimlilik devre disi: ${real}`);
                result = "skip";
                break;
            }
        }

        stack.pop();

        visited.set(key, result);

        if (result === "ok") {
            order.push({ name: candidate.name, config });
        }

        return result;
    };

    for (const name of names) {
        visit(name);
    }

    return { order, skipped, errors };
}
