import { describe, expect, it } from "vitest";

import { isPromiseLike, traceHandlerResult } from "../src/utils/async.js";

/*
 * `then` tasiyan degerler burada kasitlidir: `traceHandlerResult` tam olarak
 * bunlari yakalamak icin var. Biome'in `noThenProperty` kurali bu testleri
 * yanlis olarak isaretler.
 */
/* biome-ignore-start lint/suspicious/noThenProperty: thenable testleri kasitlidir */

describe("isPromiseLike", () => {
    it("native promise'i tanir", () => {
        expect(isPromiseLike(Promise.resolve())).toBe(true);
        expect(
            isPromiseLike(Promise.reject(new Error("x")).catch(() => 1))
        ).toBe(true);
    });

    it("thenable degeri tanir", () => {
        expect(isPromiseLike({ then: (): void => undefined })).toBe(true);
    });

    it("then metodu olmayan degerleri reddeder", () => {
        expect(isPromiseLike(null)).toBe(false);
        expect(isPromiseLike(undefined)).toBe(false);
        expect(isPromiseLike(1)).toBe(false);
        expect(isPromiseLike("then")).toBe(false);
        expect(isPromiseLike({ then: 1 })).toBe(false);
    });
});

describe("traceHandlerResult - senkron hata", () => {
    it("throw eden handler'in hatasini bildirir", () => {
        const errors: unknown[] = [];

        const result = traceHandlerResult(
            () => {
                throw new Error("patladi");
            },
            error => errors.push(error)
        );

        expect(result).toBeUndefined();
        expect(errors).toHaveLength(1);
        expect((errors[0] as Error).message).toBe("patladi");
    });

    it("duz deger donduren handler hata bildirmez", () => {
        const errors: unknown[] = [];

        traceHandlerResult(
            () => 42,
            error => errors.push(error)
        );

        expect(errors).toEqual([]);
    });
});

describe("traceHandlerResult - asenkron hata", () => {
    it("reddedilmis native promise'i bildirir", async () => {
        const errors: unknown[] = [];

        traceHandlerResult(
            async () => {
                throw new Error("asenkron patladi");
            },
            error => errors.push(error)
        );

        await new Promise(resolve => setImmediate(resolve));

        expect(errors).toHaveLength(1);
        expect((errors[0] as Error).message).toBe("asenkron patladi");
    });

    it("thenable reddini de bildirir (native promise degil)", async () => {
        const errors: unknown[] = [];

        traceHandlerResult(
            () => ({
                then: (_resolve: unknown, reject: (reason: unknown) => void) =>
                    reject(new Error("thenable patladi"))
            }),
            error => errors.push(error)
        );

        await new Promise(resolve => setImmediate(resolve));

        expect(errors).toHaveLength(1);
        expect((errors[0] as Error).message).toBe("thenable patladi");
    });

    it("cozulen promise icin bildirim yapmaz", async () => {
        const errors: unknown[] = [];

        traceHandlerResult(
            async () => "tamam",
            error => errors.push(error)
        );

        await new Promise(resolve => setImmediate(resolve));

        expect(errors).toEqual([]);
    });
});
/* biome-ignore-end lint/suspicious/noThenProperty: thenable testleri kasitlidir */
