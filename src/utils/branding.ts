/**
 * Dissora marka varliklari: ASCII logolar, ana renk akisi ve semantik palet.
 *
 * Ana logo gradyani: #5865f2 -> #8b5cf6
 * TakimCizgisi (LSH) logosu: #cc0000
 */

import { getStyler, type Rgb } from "./colors.js";

export const BRAND_GRADIENT: readonly [string, string] = ["#5865f2", "#8b5cf6"];

export const LSH_COLOR = "#cc0000";

export const DISSORA_LOGO: readonly string[] = [
    "█▀▄ █ █▀ █▀ █▀█ █▀█ ▄▀█",
    "█▄▀ █ ▄█ ▄█ █▄█ █▀▄ █▀█"
];

export const LSH_LOGO: readonly string[] = [
    "▀█▀ ▄▀█ █▄▀ █ █▀▄▀█ █▀▀ █ ▀█ █▀▀ █ █▀ █",
    "░█░ █▀█ █░█ █ █░▀░█ █▄▄ █ █▄ █▄█ █ ▄█ █"
];

export const PALETTE = {
    brand: "#5865f2",
    brandAlt: "#8b5cf6",
    accent: "#cc0000",
    success: "#22c55e",
    warn: "#f59e0b",
    error: "#ef4444",
    info: "#38bdf8",
    debug: "#94a3b8",
    muted: "#64748b",
    text: "#e2e8f0"
} as const;

export const MODULE_TAG_COLORS: readonly string[] = [
    "#5865f2",
    "#8b5cf6",
    "#06b6d4",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#6366f1",
    "#14b8a6"
];

export function renderDissoraLogo(
    gradient: readonly string[] = BRAND_GRADIENT
): string {
    return getStyler().gradientLines(DISSORA_LOGO, gradient).join("\n");
}

export function renderLshLogo(color: string = LSH_COLOR): string {
    const styler = getStyler();

    return LSH_LOGO.map(line => styler.hex(color, line)).join("\n");
}

/**
 * Konsol ciktilarinda kullanilan tam banner: ana logo + altinda TakimCizgisi logosu.
 */
export function renderBanner(): string {
    const styler = getStyler();
    const caption = styler.dim("TakimCizgisi");

    return [renderDissoraLogo(), "", renderLshLogo(), caption].join("\n");
}

function hashText(value: string): number {
    let hash = 0;

    for (let index = 0; index < value.length; index++) {
        hash = (hash << 5) - hash + value.charCodeAt(index);
        hash |= 0;
    }

    return Math.abs(hash);
}

/**
 * Modul adindan kararli (deterministik) bir etiket rengi secer.
 * Ayni modul her zaman ayni rengi alir.
 */
export function tagColorFor(name: string): string {
    const index = hashText(name.toLowerCase()) % MODULE_TAG_COLORS.length;

    return MODULE_TAG_COLORS[index] ?? PALETTE.brand;
}

export function rgbOf(hex: string): Rgb {
    return [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16)
    ];
}
