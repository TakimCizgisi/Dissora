import { describe, expect, it } from "vitest";

import { flagBool, flagList, flagString, parseArgs } from "../src/cli/utils.js";

describe("parseArgs konumsal argumanlar", () => {
    it("bayraksiz komutu korur", () => {
        expect(parseArgs(["start"]).positionals).toEqual(["start"]);
    });

    it("bayrak sonrasi konumsal deger yutulmaz", () => {
        const args = parseArgs(["create", "--ts", "my-bot"]);

        expect(args.positionals).toEqual(["create", "my-bot"]);
        expect(flagBool(args, "ts")).toBe(true);
    });

    it("bayrak komuttan once de konumsali korur", () => {
        const args = parseArgs(["--no-banner", "dev"]);

        expect(args.positionals).toEqual(["dev"]);
        expect(flagBool(args, "no-banner")).toBe(false);
    });

    it("-- ayiricidan sonrasi tamamen konumsaldir", () => {
        const args = parseArgs(["config", "set", "--", "--ts"]);

        expect(args.positionals).toEqual(["config", "set", "--ts"]);
    });
});

describe("parseArgs boolean bayraklar", () => {
    it("--no-onekli bayraklar false yazar ve karsiligi false olur", () => {
        const args = parseArgs([
            "dev",
            "--no-sync",
            "--no-banner",
            "--no-color"
        ]);

        expect(flagBool(args, "no-sync")).toBe(false);
        expect(flagBool(args, "no-banner")).toBe(false);
        expect(flagBool(args, "no-color")).toBe(false);
        expect(flagBool(args, "sync")).toBe(false);
        expect(flagBool(args, "banner")).toBe(false);
    });

    it("--sync bayragi true yazar", () => {
        expect(flagBool(parseArgs(["dev", "--sync"]), "sync")).toBe(true);
    });

    it("--ts=false dugum halinde false sayilir", () => {
        const args = parseArgs(["create", "x", "--ts=false"]);

        expect(flagBool(args, "ts")).toBe(false);
        expect(args.positionals).toEqual(["create", "x"]);
    });

    it("--ts=true dugum halinde true sayilir", () => {
        expect(flagBool(parseArgs(["create", "x", "--ts=true"]), "ts")).toBe(
            true
        );
    });

    it("bilinmeyen bayrak deger yutmaz", () => {
        const args = parseArgs(["install", "paket", "--force"]);

        expect(args.positionals).toEqual(["install", "paket"]);
        expect(flagBool(args, "force")).toBe(true);
    });
});

describe("parseArgs deger tasyan bayraklar", () => {
    it("--log-level degeri okunur", () => {
        expect(
            flagString(
                parseArgs(["start", "--log-level", "debug"]),
                "log-level"
            )
        ).toBe("debug");
    });

    it("--log-level=debug yazimi calisir", () => {
        expect(
            flagString(parseArgs(["start", "--log-level=debug"]), "log-level")
        ).toBe("debug");
    });

    it("deger olarak --no-banner yazilirsa bayrak olarak kalir", () => {
        const args = parseArgs(["start", "--log-level", "--no-banner"]);

        expect(args.positionals).toEqual(["start"]);
        expect(flagString(args, "log-level")).toBeNull();
        expect(flagBool(args, "no-banner")).toBe(false);
    });

    it("kisa bayraklar genis karsiliklara baglanir", () => {
        expect(flagBool(parseArgs(["-v"]), "version")).toBe(true);
        expect(flagBool(parseArgs(["-h"]), "help")).toBe(true);
        expect(
            flagString(parseArgs(["start", "-l", "warn"]), "log-level")
        ).toBe("warn");
    });

    it("negatif sayi konumsal sayilir", () => {
        expect(parseArgs(["config", "set", "x", "-1"]).positionals).toEqual([
            "config",
            "set",
            "x",
            "-1"
        ]);
    });
});

describe("flagList", () => {
    it("virgulle ayrilmis degeri böler", () => {
        expect(flagList(parseArgs(["--requires", "A,B"]), "requires")).toEqual([
            "A",
            "B"
        ]);
    });

    it("tekrarlanan bayragi kaybetmez", () => {
        const args = parseArgs(["--requires", "A", "--requires", "B"]);

        expect(flagList(args, "requires")).toEqual(["A", "B"]);
    });

    it("virgul ve tekrari birlikte destekler", () => {
        const args = parseArgs(["--requires=A,B", "--requires", "C"]);

        expect(flagList(args, "requires")).toEqual(["A", "B", "C"]);
    });

    it("bosluklari kirpar ve tekrarlari eler", () => {
        expect(
            flagList(parseArgs(["--requires", " A , ,B,A"]), "requires")
        ).toEqual(["A", "B"]);
    });

    it("bayrak yoksa bos dizi doner", () => {
        expect(flagList(parseArgs(["module", "list"]), "requires")).toEqual([]);
    });
});
