import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Logger } from "../src/services/Logger.js";
import { watchTree } from "../src/services/Watcher.js";

let root: string;

function sink(): NodeJS.WritableStream {
    return {
        write(): boolean {
            return true;
        }
    } as unknown as NodeJS.WritableStream;
}

function silentLogger(): Logger {
    const stream = sink();

    return new Logger({ level: "silent", out: stream, err: stream });
}

function quietLogger(): Logger {
    const stream = sink();

    return new Logger({ level: "debug", out: stream, err: stream });
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dissora-watch-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("watchTree - eksik dizin", () => {
    it("yoksa mode none doner ve uyari yazar", () => {
        const messages: string[] = [];
        const stream = {
            write(chunk: string): boolean {
                messages.push(chunk);

                return true;
            }
        } as unknown as NodeJS.WritableStream;
        const logger = new Logger({ level: "warn", out: stream, err: stream });
        const missing = join(root, "Modules");

        const handle = watchTree({
            dir: missing,
            logger,
            onChange: () => undefined
        });

        expect(handle.mode).toBe("none");
        expect(messages.join("")).toMatch(/modul dizini bulunamadi/);

        handle.close();
    });
});

describe("watchTree - fs modu", () => {
    it("dosya degisiminde onChange cagirir", async () => {
        const dir = join(root, "Modules");

        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "a.js"), "1", "utf8");

        const seen: string[] = [];
        const handle = watchTree({
            dir,
            debounceMs: 20,
            logger: silentLogger(),
            onChange: reason => void seen.push(reason)
        });

        try {
            expect(handle.mode).toBe("fs");

            await sleep(80);
            writeFileSync(join(dir, "a.js"), "2", "utf8");

            await sleep(400);

            expect(seen.length).toBeGreaterThan(0);
        } finally {
            handle.close();
        }
    });

    it("onChange hatasi izleyiciyi oldurmez", async () => {
        const dir = join(root, "Modules");

        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "a.js"), "1", "utf8");

        const warnings: string[] = [];
        const stream = {
            write(chunk: string): boolean {
                warnings.push(chunk);

                return true;
            }
        } as unknown as NodeJS.WritableStream;

        let calls = 0;

        const handle = watchTree({
            dir,
            debounceMs: 20,
            logger: new Logger({ level: "warn", out: stream, err: stream }),
            onChange: () => {
                calls++;

                throw new Error("isleyici patladi");
            }
        });

        try {
            await sleep(80);
            writeFileSync(join(dir, "a.js"), "2", "utf8");

            await sleep(400);

            expect(calls).toBeGreaterThan(0);
            expect(warnings.join("")).toMatch(/degisiklik isleyici hatasi/);

            // Ikinci degisiklik de islenir.
            writeFileSync(join(dir, "a.js"), "3", "utf8");
            await sleep(400);

            expect(calls).toBeGreaterThan(1);
        } finally {
            handle.close();
        }
    });

    it("close sonrasi degisiklik bildirilmez", async () => {
        const dir = join(root, "Modules");

        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "a.js"), "1", "utf8");

        let calls = 0;

        const handle = watchTree({
            dir,
            debounceMs: 20,
            logger: quietLogger(),
            onChange: () => {
                calls++;
            }
        });

        handle.close();
        await sleep(50);

        writeFileSync(join(dir, "a.js"), "2", "utf8");
        await sleep(400);

        expect(calls).toBe(0);
    });
});
