import { describe, expect, it } from "vitest";

import {
    type ModuleConfig,
    parseModuleConfig
} from "../src/config/module-config.js";
import {
    type ModuleCandidate,
    resolveModulePlan
} from "../src/core/DependencyResolver.js";

function candidate(
    name: string,
    requires: string[] = [],
    extra: Partial<ModuleConfig> = {}
): ModuleCandidate {
    return {
        name,
        config: parseModuleConfig({ name, requires, ...extra }),
        error: null
    };
}

function broken(name: string): ModuleCandidate {
    return {
        name,
        config: null,
        error: new Error("moduleconfig.json bulunamadi")
    };
}

function names(plan: ReturnType<typeof resolveModulePlan>): string[] {
    return plan.order.map(entry => entry.name);
}

describe("resolveModulePlan", () => {
    it("bagimlilik yoksa alfabetik siralar", () => {
        const plan = resolveModulePlan([candidate("Zeta"), candidate("Alfa")]);

        expect(names(plan)).toEqual(["Alfa", "Zeta"]);
    });

    it("bagimlilik yuklenmeden once gelir", () => {
        const plan = resolveModulePlan([
            candidate("Uygulama", ["Veri"]),
            candidate("Veri")
        ]);

        expect(names(plan)).toEqual(["Veri", "Uygulama"]);
    });

    it("zinciri dogru siralar", () => {
        const plan = resolveModulePlan([
            candidate("C", ["B"]),
            candidate("B", ["A"]),
            candidate("A")
        ]);

        expect(names(plan)).toEqual(["A", "B", "C"]);
    });

    it("devre disi modul atlanir", () => {
        const plan = resolveModulePlan([
            candidate("A", [], { enabled: false })
        ]);

        expect(names(plan)).toEqual([]);
        expect(plan.skipped[0]?.reason).toMatch(/enabled: false/);
    });

    it("devre disi bagimlilik, bagli modulü de atlar", () => {
        const plan = resolveModulePlan([
            candidate("A", [], { enabled: false }),
            candidate("B", ["A"])
        ]);

        expect(names(plan)).toEqual([]);
        expect(plan.skipped.map(entry => entry.name).sort()).toEqual([
            "A",
            "B"
        ]);
    });

    it("eksik bagimlilik hatadir", () => {
        const plan = resolveModulePlan([candidate("B", ["Yok"])]);

        expect(names(plan)).toEqual([]);
        expect(plan.errors.map(entry => entry.name)).toContain("B");
    });

    it("bozuk config hatadir ve digerlerini engellemez", () => {
        const plan = resolveModulePlan([broken("Bozuk"), candidate("Iyi")]);

        expect(names(plan)).toEqual(["Iyi"]);
        expect(plan.errors[0]?.name).toBe("Bozuk");
    });

    it("donguyu okunabilir bir yolla raporlar", () => {
        const plan = resolveModulePlan([
            candidate("A", ["B"]),
            candidate("B", ["A"])
        ]);

        expect(names(plan)).toEqual([]);
        expect(plan.errors.length).toBeGreaterThan(0);
        expect(plan.errors[0]?.reason).toMatch(/dongusu/);
    });

    it("cift bagimlilik modulü iki kez yuklemez", () => {
        const plan = resolveModulePlan([
            candidate("Paylasilan"),
            candidate("A", ["Paylasilan"]),
            candidate("B", ["Paylasilan"])
        ]);

        expect(names(plan).filter(name => name === "Paylasilan")).toHaveLength(
            1
        );
    });

    it("requires yazimi klasor adiyla eslesmezse bagimlilik cozulur", () => {
        // Klasor `Log`, config'de `log` yazilmis olabilir.
        const plan = resolveModulePlan([
            candidate("Log"),
            candidate("Economy", ["log"])
        ]);

        expect(names(plan)).toEqual(["Log", "Economy"]);
        expect(plan.errors).toEqual([]);
    });

    it("devre disi bagimlilik buyuk/kucuk harf farkinda da atlanir", () => {
        const plan = resolveModulePlan([
            candidate("Log", [], { enabled: false }),
            candidate("Economy", ["LOG"])
        ]);

        expect(names(plan)).not.toContain("Economy");
        expect(plan.skipped.some(entry => entry.name === "Economy")).toBe(true);
    });

    it("bosluklu requires kirparilir", () => {
        const plan = resolveModulePlan([
            candidate("Log"),
            candidate("Economy", ["  log  "])
        ]);

        expect(names(plan)).toEqual(["Log", "Economy"]);
    });

    it("dongu hatasinda ilgisiz modul etkilenmez", () => {
        const plan = resolveModulePlan([
            candidate("A", ["B"]),
            candidate("B", ["A"]),
            candidate("C", ["A"]),
            candidate("D")
        ]);

        // D bagimliliksiz olasi bagimsiz.
        expect(names(plan)).toEqual(["D"]);

        // C yalnizca A nedeniyle atlanmali, "dongu" hatasi almamali.
        const errorForC = plan.errors.find(entry => entry.name === "C");

        expect(errorForC).toBeDefined();
        expect(errorForC?.reason).not.toMatch(/dongusu/);
    });

    it("ucunlu dongude tum uyeler hata alir", () => {
        const plan = resolveModulePlan([
            candidate("A", ["B"]),
            candidate("B", ["C"]),
            candidate("C", ["A"])
        ]);

        for (const name of ["A", "B", "C"]) {
            expect(plan.errors.some(entry => entry.name === name)).toBe(true);
        }

        expect(names(plan)).toEqual([]);
    });

    it("bos aday listesi bos plan verir", () => {
        const plan = resolveModulePlan([]);

        expect(plan.order).toEqual([]);
        expect(plan.errors).toEqual([]);
        expect(plan.skipped).toEqual([]);
    });

    it("ayni modul iki kez verilirse bir kez islenir", () => {
        const plan = resolveModulePlan([candidate("A"), candidate("A")]);

        expect(names(plan)).toEqual(["A"]);
    });
});
