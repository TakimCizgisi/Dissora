import { LOG_LEVELS, type LogLevel } from "../config/env.js";
import { PALETTE, tagColorFor } from "../utils/branding.js";
import { getStyler } from "../utils/colors.js";

export type { LogLevel };

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    silent: 100
};

export function isLogLevel(value: string): value is LogLevel {
    return (LOG_LEVELS as readonly string[]).includes(value);
}

export interface LoggerOptions {
    readonly level?: LogLevel;
    readonly timestamps?: boolean;
    readonly tag?: string | null;
    readonly tagColor?: string;
    readonly out?: NodeJS.WritableStream;
    readonly err?: NodeJS.WritableStream;
}

function formatArgs(args: unknown[]): string {
    return args
        .map(arg => {
            if (typeof arg === "string") {
                return arg;
            }

            if (arg instanceof Error) {
                return arg.stack ?? arg.message;
            }

            try {
                return JSON.stringify(arg);
            } catch {
                return String(arg);
            }
        })
        .join(" ");
}

/**
 * Konsol logger'i.
 *
 * Renkler terminal destegine gore otomatik secilir; `DISSORA_NO_COLOR`,
 * `NO_COLOR` veya `--no-color` ile kapatilabilir.
 */
export class Logger {
    private currentLevel: LogLevel;

    private readonly timestamps: boolean;

    private readonly tagName: string | null;

    private readonly tagColor: string;

    private readonly out: NodeJS.WritableStream;

    private readonly err: NodeJS.WritableStream;

    constructor(options: LoggerOptions = {}) {
        this.currentLevel = options.level ?? "info";
        this.timestamps = options.timestamps ?? false;
        this.tagName = options.tag ?? null;
        this.tagColor =
            options.tagColor ??
            (options.tag === undefined || options.tag === null
                ? PALETTE.brand
                : tagColorFor(options.tag));
        this.out = options.out ?? process.stdout;
        this.err = options.err ?? process.stderr;
    }

    get level(): LogLevel {
        return this.currentLevel;
    }

    setLevel(level: LogLevel): void {
        this.currentLevel = level;
    }

    isEnabled(level: LogLevel): boolean {
        return LEVEL_ORDER[level] >= LEVEL_ORDER[this.currentLevel];
    }

    /** Modul etiketli alt logger. Ayni modul adi her zaman ayni rengi alir. */
    child(tag: string): Logger {
        return new Logger({
            level: this.currentLevel,
            timestamps: this.timestamps,
            tag,
            out: this.out,
            err: this.err
        });
    }

    private prefix(message: string): string {
        const styler = getStyler();
        const parts: string[] = [];

        if (this.timestamps) {
            parts.push(styler.dim(`[${new Date().toISOString()}]`));
        }

        if (this.tagName !== null) {
            parts.push(styler.hex(this.tagColor, `[${this.tagName}]`));
        }

        return parts.length > 0 ? `${parts.join(" ")} ${message}` : message;
    }

    private write(
        level: LogLevel,
        color: string,
        icon: string,
        message: string,
        args: unknown[],
        stream: NodeJS.WritableStream
    ): void {
        if (!this.isEnabled(level)) {
            return;
        }

        const head = getStyler().hex(color, icon);
        const extra = args.length > 0 ? ` ${formatArgs(args)}` : "";

        stream.write(`${this.prefix(`${head} ${message}`)}${extra}\n`);
    }

    trace(message: string, ...args: unknown[]): void {
        this.write(
            "trace",
            PALETTE.muted,
            "·",
            getStyler().dim(message),
            args,
            this.out
        );
    }

    debug(message: string, ...args: unknown[]): void {
        this.write(
            "debug",
            PALETTE.debug,
            "·",
            getStyler().dim(message),
            args,
            this.out
        );
    }

    info(message: string, ...args: unknown[]): void {
        this.write("info", PALETTE.brand, "›", message, args, this.out);
    }

    /** Basariyi `info` esiginde gosterir ama yesil ikon kullanir. */
    success(message: string, ...args: unknown[]): void {
        this.write("info", PALETTE.success, "✓", message, args, this.out);
    }

    warn(message: string, ...args: unknown[]): void {
        this.write("warn", PALETTE.warn, "!", message, args, this.out);
    }

    error(message: string, ...args: unknown[]): void {
        this.write("error", PALETTE.error, "✖", message, args, this.err);
    }

    /** Etiketsiz dogrudan yazdirma (yardim ciktisi, tablolar). */
    print(message: string): void {
        this.out.write(`${message}\n`);
    }
}

export function createLogger(options: LoggerOptions = {}): Logger {
    return new Logger(options);
}
