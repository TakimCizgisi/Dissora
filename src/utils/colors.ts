/**
 * Renk destegi tespiti ve ANSI cikti uretimi.
 *
 * Terminal destegi sirasi:
 *   truecolor (24 bit) -> 256 renk -> 16 renk -> sade-eski (komsulu kod)
 * NO_COLOR / FORCE_COLOR / DISSORA_NO_COLOR ortam degiskenleri desteklenir.
 */

export type Rgb = readonly [number, number, number];

export type ColorDepth = 0 | 1 | 4 | 8 | 24;

export interface ColorSupport {
    readonly enabled: boolean;
    readonly depth: ColorDepth;
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

const ESC = "\u001B";
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, "g");

const CUBE_STEPS: readonly number[] = [0, 95, 135, 175, 215, 255];

const ANSI16_CODES: readonly number[] = [
    30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97
];

const ANSI16_RGB: readonly Rgb[] = [
    [0, 0, 0],
    [205, 0, 0],
    [0, 205, 0],
    [205, 205, 0],
    [0, 0, 238],
    [205, 0, 205],
    [0, 205, 205],
    [229, 229, 229],
    [127, 127, 127],
    [255, 0, 0],
    [0, 255, 0],
    [255, 255, 0],
    [92, 92, 255],
    [255, 0, 255],
    [0, 255, 255],
    [255, 255, 255]
];

const RESET = "\u001B[0m";

export function clamp(value: number, min: number, max: number): number {
    if (value < min) {
        return min;
    }

    return value > max ? max : value;
}

export function hexToRgb(hex: string): Rgb {
    const match = HEX_PATTERN.exec(hex.trim());

    if (!match) {
        throw new Error(`Geçersiz hex renk: "${hex}"`);
    }

    let body = match[1] ?? "";

    if (body.length === 3) {
        body = body
            .split("")
            .map(char => char + char)
            .join("");
    }

    const value = Number.parseInt(body, 16);

    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function rgbToHex([r, g, b]: Rgb): string {
    const channel = (value: number) =>
        clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");

    return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function mixColor(from: Rgb, to: Rgb, amount: number): Rgb {
    const ratio = clamp(amount, 0, 1);

    return [
        Math.round(from[0] + (to[0] - from[0]) * ratio),
        Math.round(from[1] + (to[1] - from[1]) * ratio),
        Math.round(from[2] + (to[2] - from[2]) * ratio)
    ];
}

export function rgbToAnsi256([r, g, b]: Rgb): number {
    const red = clamp(Math.round(r), 0, 255);
    const green = clamp(Math.round(g), 0, 255);
    const blue = clamp(Math.round(b), 0, 255);

    if (red === green && green === blue) {
        if (red < 8) {
            return 16;
        }

        if (red > 248) {
            return 231;
        }

        return Math.round(((red - 8) / 247) * 24) + 232;
    }

    return (
        16 +
        36 * Math.round((red / 255) * 5) +
        6 * Math.round((green / 255) * 5) +
        Math.round((blue / 255) * 5)
    );
}

export function ansi256ToRgb(code: number): Rgb {
    if (code >= 232 && code <= 255) {
        const gray = 8 + (code - 232) * 10;
        return [gray, gray, gray];
    }

    const index = code - 16;
    const remainder = index % 36;
    const step = (value: number) => CUBE_STEPS[clamp(value, 0, 5)] ?? 0;

    return [
        step(Math.floor(index / 36)),
        step(Math.floor(remainder / 6)),
        step(remainder % 6)
    ];
}

export function rgbToAnsi16(rgb: Rgb): number {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < ANSI16_RGB.length; index++) {
        const candidate = ANSI16_RGB[index] ?? rgb;
        const distance =
            (candidate[0] - rgb[0]) ** 2 +
            (candidate[1] - rgb[1]) ** 2 +
            (candidate[2] - rgb[2]) ** 2;

        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    }

    return ANSI16_CODES[bestIndex] ?? 37;
}

export function ansi16ToRgb(code: number): Rgb {
    const index = ANSI16_CODES.indexOf(code);

    if (index === -1) {
        return [229, 229, 229];
    }

    return ANSI16_RGB[index] ?? [229, 229, 229];
}

export function stripAnsi(text: string): string {
    return text.replace(ANSI_PATTERN, "");
}

function normalizeDepth(value: number): ColorDepth {
    if (value <= 0) {
        return 0;
    }

    if (value <= 1) {
        return 1;
    }

    if (value <= 4) {
        return 4;
    }

    if (value <= 8) {
        return 8;
    }

    return 24;
}

export function detectColorSupport(
    stream: NodeJS.WriteStream = process.stdout
): ColorSupport {
    const env = process.env;

    if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") {
        return { enabled: false, depth: 0 };
    }

    const forced = env.FORCE_COLOR;

    if (forced !== undefined) {
        if (forced === "0" || forced === "false" || forced === "none") {
            return { enabled: false, depth: 0 };
        }

        const parsed = Number.parseInt(forced, 10);
        const depth = Number.isFinite(parsed) ? normalizeDepth(parsed) : 24;

        return { enabled: true, depth: depth === 0 ? 24 : depth };
    }

    if (env.DISSORA_NO_COLOR === "1" || env.DISSORA_NO_COLOR === "true") {
        return { enabled: false, depth: 0 };
    }

    if (stream?.isTTY !== true) {
        return { enabled: false, depth: 0 };
    }

    let depth: ColorDepth = 1;

    try {
        depth = normalizeDepth(stream.getColorDepth());
    } catch {
        depth = 1;
    }

    return { enabled: depth > 0, depth };
}

export class Styler {
    readonly support: ColorSupport;

    constructor(support: ColorSupport) {
        this.support = support;
    }

    get enabled(): boolean {
        return this.support.enabled;
    }

    get depth(): ColorDepth {
        return this.support.depth;
    }

    private fgCode(rgb: Rgb): string {
        switch (this.support.depth) {
            case 24:
                return `\u001B[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
            case 8:
                return `\u001B[38;5;${rgbToAnsi256(rgb)}m`;
            case 4:
            case 1:
                return `\u001B[${rgbToAnsi16(rgb)}m`;
            default:
                return "";
        }
    }

    rgb(rgb: Rgb, text: string): string {
        const code = this.fgCode(rgb);

        if (code === "") {
            return text;
        }

        return `${code}${text}${RESET}`;
    }

    hex(hex: string, text: string): string {
        return this.rgb(hexToRgb(hex), text);
    }

    bold(text: string): string {
        return this.enabled ? `\u001B[1m${text}${RESET}` : text;
    }

    dim(text: string): string {
        return this.enabled ? `\u001B[2m${text}${RESET}` : text;
    }

    italic(text: string): string {
        return this.enabled ? `\u001B[3m${text}${RESET}` : text;
    }

    underline(text: string): string {
        return this.enabled ? `\u001B[4m${text}${RESET}` : text;
    }

    /**
     * Metni verilen duraklar arasinda duz bir gradyan ile boyar.
     * Bosluk karakterleri renk almaz ama gradyan ilerlemesi korunur.
     */
    gradient(text: string, stops: readonly string[]): string {
        const colors = stops.map(hexToRgb);

        if (colors.length === 0 || text.length === 0) {
            return text;
        }

        if (colors.length === 1) {
            return this.rgb(colors[0] ?? [0, 0, 0], text);
        }

        const chars = Array.from(text);
        const segments = colors.length - 1;
        const lastIndex = Math.max(chars.length - 1, 1);
        let out = "";

        for (let index = 0; index < chars.length; index++) {
            const char = chars[index] ?? " ";
            const scaled = (index / lastIndex) * segments;
            const lower = clamp(Math.floor(scaled), 0, segments - 1);
            const color = mixColor(
                colors[lower] ?? [0, 0, 0],
                colors[lower + 1] ?? colors[lower] ?? [0, 0, 0],
                scaled - lower
            );

            out += char === " " ? char : this.rgb(color, char);
        }

        return out;
    }

    gradientLines(
        lines: readonly string[],
        stops: readonly string[]
    ): string[] {
        return lines.map(line => this.gradient(line, stops));
    }
}

let activeStyler = new Styler(detectColorSupport());

export function getStyler(): Styler {
    return activeStyler;
}

export function setColorSupport(support: ColorSupport): Styler {
    activeStyler = new Styler(support);
    return activeStyler;
}

export function createStyler(support: ColorSupport): Styler {
    return new Styler(support);
}
