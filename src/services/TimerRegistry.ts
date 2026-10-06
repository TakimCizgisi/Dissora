import { traceHandlerResult } from "../utils/async.js";
import type { Logger } from "./Logger.js";

export interface TimerHandle {
    readonly label: string;
    readonly interval: number;
    /** `clearInterval` icin saklanan gercek handle. */
    readonly timer: NodeJS.Timeout;
    cancel(): void;
}

export interface ActiveTimer {
    readonly label: string;
    readonly interval: number;
}

/**
 * Tum `setInterval` cagrilarini tek yerde toplar.
 *
 * Bot kapanirken `clearAll()` cagrilir; boylece `dissora dev` yeniden
 * baslatmalarinda ve normal `stop()` sonrasinda orphan timer kalmaz.
 */
export class TimerRegistry {
    private readonly handles = new Map<symbol, TimerHandle>();

    /**
     * Baslatma sirasi.
     *
     * Sayim tabanli rollback hataliydi: bir zamanlayici iptal edilirse
     * `size` azalir ve eski `count` degeri yanlis hedefi isaret eder.
     * Gunluk (journal) iptal edilen kayitlari da tutar, boylece isaret
     * (mark) her zaman konum olarak kullanilabilir.
     */
    private readonly journal: symbol[] = [];

    private readonly logger: Logger | undefined;

    constructor(logger?: Logger) {
        this.logger = logger;
    }

    get size(): number {
        return this.handles.size;
    }

    active(): ActiveTimer[] {
        return [...this.handles.values()].map(handle => ({
            label: handle.label,
            interval: handle.interval
        }));
    }

    /** Etiketli, tekrar eden is. Hata olursa bir sonraki tick'i engellemez. */
    every(
        label: string,
        interval: number,
        task: () => unknown | Promise<unknown>
    ): TimerHandle {
        const key = Symbol(label);
        const run = () => {
            traceHandlerResult(task, error => {
                this.logger?.error(
                    `gorev hatasi: ${label}`,
                    error instanceof Error ? error.message : error
                );
            });
        };

        const timer = setInterval(run, interval);
        const handle: TimerHandle = {
            label,
            interval,
            timer,
            cancel: () => {
                clearInterval(timer);
                this.forget(key);
            }
        };

        this.handles.set(key, handle);
        this.journal.push(key);

        this.logger?.debug(`zamanlayici baslatildi: ${label} (${interval}ms)`);

        return handle;
    }

    /** Bir kez calisir, hata durumunda yutulur. */
    async run(
        label: string,
        task: () => unknown | Promise<unknown>
    ): Promise<void> {
        try {
            await task();
        } catch (error) {
            this.logger?.error(
                `gorev hatasi: ${label}`,
                error instanceof Error ? error.message : error
            );
        }
    }

    cancel(handle: TimerHandle | undefined): void {
        handle?.cancel();
    }

    /** Tek bir zamanlayiciyi gunlukten de cikarir. */
    private forget(key: symbol): void {
        this.handles.delete(key);

        const index = this.journal.indexOf(key);

        if (index !== -1) {
            this.journal.splice(index, 1);
        }
    }

    /** Baslangic durumunun gunluk konumunu dondurur. */
    mark(): number {
        return this.journal.length;
    }

    /**
     * `mark()` anindan sonra baslatilan zamanlayicilari iptal eder.
     *
     * Modul yuklemesi basarisiz oldugunda, onceden yuklenen modullerin
     * gorevlerine dokunmadan yalnizca bu modulunkileri geri alir.
     *
     * @returns iptal edilen zamanlayici sayisi.
     */
    rollback(mark: number): number {
        const doomed = this.journal.splice(mark);

        for (const key of doomed) {
            const handle = this.handles.get(key);

            if (handle) {
                clearInterval(handle.timer);
                this.handles.delete(key);
            }
        }

        return doomed.length;
    }

    /** Tum zamanlayicilari durdurur. Kapanis sirasinda cagrilir. */
    clearAll(): number {
        const count = this.handles.size;

        for (const handle of this.handles.values()) {
            clearInterval(handle.timer);
        }

        this.handles.clear();
        this.journal.length = 0;

        if (count > 0) {
            this.logger?.debug(`${count} zamanlayici durduruldu`);
        }

        return count;
    }
}
