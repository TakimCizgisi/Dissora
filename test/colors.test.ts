import { describe, expect, it } from "vitest";

import {
    ansi16ToRgb,
    ansi256ToRgb,
    clamp,
    hexToRgb,
    mixColor,
    rgbToAnsi16,
    rgbToAnsi256,
    rgbToHex,
    Styler
} from "../src/utils/colors.js";

describe("hexToRgb", () => {
    it("6 haneli hex'i ayristirir", () => {
        expect(hexToRgb("#5865f2")).toEqual([88, 101, 242]);
    });

    it("3 haneli hex'i genisletir", () => {
        expect(hexToRgb("#f0a")).toEqual([255, 0, 170]);
    });

    it("# isareti opsiyoneldir", () => {
        expect(hexToRgb("5865f2")).toEqual([88, 101, 242]);
    });

    it("gecersiz degerde hata firlatir", () => {
        expect(() => hexToRgb("#zzzzzz")).toThrow(/Geçersiz hex/);
    });
});

describe("rgbToHex", () => {
    it("donusum gidis-geldis", () => {
        expect(rgbToHex(hexToRgb("#8b5cf6"))).toBe("#8b5cf6");
    });

    it("degerleri 0-255 araligina kirpar", () => {
        expect(rgbToHex([-10, 300, 128])).toBe("#00ff80");
    });
});

describe("clamp", () => {
    it("alt ve ust sinirlari uygular", () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-1, 0, 10)).toBe(0);
        expect(clamp(99, 0, 10)).toBe(10);
    });
});

describe("mixColor", () => {
    it("0 ve 1 uclarinda kaynak/hedef rengi doner", () => {
        expect(mixColor([0, 0, 0], [10, 20, 30], 0)).toEqual([0, 0, 0]);
        expect(mixColor([0, 0, 0], [10, 20, 30], 1)).toEqual([10, 20, 30]);
    });

    it("ortasi yuvarlar", () => {
        expect(mixColor([0, 0, 0], [10, 20, 30], 0.5)).toEqual([5, 10, 15]);
    });

    it("orani 0-1 araligina kirpar", () => {
        expect(mixColor([0, 0, 0], [10, 20, 30], 5)).toEqual([10, 20, 30]);
    });
});

describe("ansi256 donusumleri", () => {
    it("gri tonlari gri cubuga eslenir", () => {
        expect(ansi256ToRgb(16)).toEqual([0, 0, 0]);
        expect(ansi256ToRgb(231)).toEqual([255, 255, 255]);
    });

    it("rgb -> 256 geri donusum", () => {
        const code = rgbToAnsi256([255, 0, 0]);

        expect(ansi256ToRgb(code)).toEqual([255, 0, 0]);
    });
});

describe("rgbToAnsi16 / ansi16ToRgb", () => {
    it("en yakin ANSI rengini secer", () => {
        expect(rgbToAnsi16([255, 0, 0])).toBe(91);
        expect(rgbToAnsi16([0, 255, 0])).toBe(92);
        expect(rgbToAnsi16([0, 0, 255])).toBe(34);
    });

    it("palet kodlari geri donusumle eslesir", () => {
        for (const code of [30, 31, 34, 37, 90, 94, 97]) {
            expect(rgbToAnsi16(ansi16ToRgb(code))).toBe(code);
        }
    });

    it("parlak kodlari 90-97 araligina esler", () => {
        expect(ansi16ToRgb(90)).toEqual([127, 127, 127]);
        expect(ansi16ToRgb(97)).toEqual([255, 255, 255]);
        expect(ansi16ToRgb(31)).toEqual([205, 0, 0]);
    });

    it("tanimsiz kodda varsayilana doner", () => {
        expect(ansi16ToRgb(999)).toEqual([229, 229, 229]);
    });

    it("hicbir kod palet disina tasmaz", () => {
        for (const code of [
            30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97
        ]) {
            const rgb = ansi16ToRgb(code);

            expect(rgb).toHaveLength(3);

            for (const channel of rgb) {
                expect(channel).toBeGreaterThanOrEqual(0);
                expect(channel).toBeLessThanOrEqual(255);
            }
        }
    });
});

const ESC = "\u001B";

describe("Styler", () => {
    it("renk desteği kapaliyken metni oldugu gibi doner", () => {
        const styler = new Styler({ enabled: false, depth: 0 });

        expect(styler.hex("#ff0000", "test")).toBe("test");
        expect(styler.bold("test")).toBe("test");
    });

    it("truecolor modunda 24 bit kod uretir", () => {
        const styler = new Styler({ enabled: true, depth: 24 });
        const out = styler.hex("#5865f2", "x");

        expect(out).toContain("38;2;88;101;242");
        expect(out).toContain("x");
        expect(out.endsWith("\u001B[0m")).toBe(true);
    });

    it("256 renk modunda kure kod uretir", () => {
        const styler = new Styler({ enabled: true, depth: 8 });

        expect(styler.hex("#5865f2", "x")).toMatch(/38;5;\d+m/);
    });

    it("16 renk modunda temel kod uretir", () => {
        const styler = new Styler({ enabled: true, depth: 4 });

        expect(styler.hex("#ff0000", "x")).toBe(`${ESC}[91mx${ESC}[0m`);
    });

    it("gradient bosluklara renk vermez", () => {
        const styler = new Styler({ enabled: true, depth: 24 });
        const out = styler.gradient("a b", ["#000000", "#ffffff"]);

        expect(out).toContain("a");
        expect(out).toContain(" ");
    });

    it("tek renk verilirse duz yazar", () => {
        const styler = new Styler({ enabled: true, depth: 24 });
        const out = styler.gradient("abc", ["#ff0000"]);

        expect(out).toContain("38;2;255;0;0");
        expect(out).toContain("abc");
    });
});
