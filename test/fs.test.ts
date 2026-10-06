import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    readJsonFile,
    setTopLevelValue,
    stripBom,
    stripJsonComments
} from "../src/utils/fs.js";

describe("stripBom", () => {
    it("UTF-8 BOM'u kaldirir", () => {
        expect(stripBom("﻿{}")).toBe("{}");
        expect(stripBom("{}")).toBe("{}");
        expect(stripBom("﻿")).toBe("");
    });
});

describe("stripJsonComments", () => {
    it("BOM'lu ve yorumlu metni temizler", () => {
        const text = `﻿{
    // aciklama
    "a": 1 /* satir ici */,
    "b": "http://ornek.com" // url'deki // yorum sayilmaz
}`;

        expect(JSON.parse(stripJsonComments(text))).toEqual({
            a: 1,
            b: "http://ornek.com"
        });
    });
});

describe("readJsonFile", () => {
    const workspace = mkdtempSync(join(tmpdir(), "dissora-fstest-"));

    afterEach(() => {
        rmSync(workspace, { recursive: true, force: true });
    });

    it("BOM'lu dosyayi okur", () => {
        const file = join(workspace, "package.json");

        writeFileSync(file, '﻿{"name":"x"}\n', "utf8");

        expect(readJsonFile(file)).toEqual({ name: "x" });
    });
});

describe("setTopLevelValue", () => {
    it("yorumlari ve girintiyi koruyarak degeri degistirir", () => {
        const text = `{
    // kullanici aciklamasi silinmemeli
    "name": "Kaynak",
    "enabled": true,
    "commands": { "enabled": true }
}`;

        const updated = setTopLevelValue(text, "enabled", "false");

        expect(updated).toContain("// kullanici aciklamasi silinmemeli");
        expect(updated).toContain('"name": "Kaynak"');
        // Ust seviye degisir...
        expect(updated).toMatch(/"enabled": false/);
        // Ic ice olan "enabled" korunur.
        expect(updated).toContain('"commands": { "enabled": true }');
        expect(JSON.parse(stripJsonComments(updated))).toEqual({
            name: "Kaynak",
            enabled: false,
            commands: { enabled: true }
        });
    });

    it("yorumlu degeri koruyarak yalnizca degeri degistirir", () => {
        const text = `{
    "enabled": /* acik */ true
}`;

        const updated = setTopLevelValue(text, "enabled", "false");

        expect(updated).toBe(`{
    "enabled": /* acik */ false
}`);
        expect(JSON.parse(stripJsonComments(updated))).toEqual({
            enabled: false
        });
    });

    it("string degerlerde yorum iceren ayirici atlama yapar", () => {
        const text = `{
    // ust seviye
    "name": "ornek",
    // enabled aciklamasi
    "enabled": true
}`;

        const updated = setTopLevelValue(text, "enabled", "false");

        expect(updated).toContain("// ust seviye");
        expect(updated).toContain("// enabled aciklamasi");
        expect(updated).toContain('"enabled": false');
    });

    it("string icindeki anahtar benzerini degistirmez", () => {
        const text = `{
    "name": "enabled",
    "enabled": true
}`;

        const updated = setTopLevelValue(text, "enabled", "false");

        expect(updated).toContain('"name": "enabled"');
        expect(JSON.parse(stripJsonComments(updated))).toEqual({
            name: "enabled",
            enabled: false
        });
    });

    it("anahtar yoksa sona ekler", () => {
        const updated = setTopLevelValue(
            `{
    "name": "x"
}`,
            "enabled",
            "true"
        );

        expect(JSON.parse(stripJsonComments(updated))).toEqual({
            name: "x",
            enabled: true
        });
    });

    it("BOM'lu metni de islerr", () => {
        const updated = setTopLevelValue(
            '﻿{\n    "enabled": true\n}',
            "enabled",
            "false"
        );

        expect(updated.startsWith("﻿")).toBe(false);
        expect(JSON.parse(stripJsonComments(updated))).toEqual({
            enabled: false
        });
    });

    it("bos objede virgul eklemez", () => {
        const updated = setTopLevelValue("{}", "enabled", "true");

        expect(JSON.parse(updated)).toEqual({ enabled: true });
    });

    it("ic ice obje ve dizileri saglikli atlar", () => {
        const text = `{
    "nested": { "a": [1, 2, { "b": true }] },
    "enabled": true,
    "after": null
}`;

        const updated = setTopLevelValue(text, "enabled", "false");

        expect(JSON.parse(stripJsonComments(updated))).toEqual({
            nested: { a: [1, 2, { b: true }] },
            enabled: false,
            after: null
        });
    });
});
