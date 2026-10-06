import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const targets = ["dist"];

for (const target of targets) {
    await rm(resolve(root, target), {
        recursive: true,
        force: true
    });
    process.stdout.write(`[clean] ${target} silindi\n`);
}
