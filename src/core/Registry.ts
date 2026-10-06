import type {
    ChatInputCommandBody,
    CommandExecutor
} from "../types/context.js";

/** Framework'un ekledigi, kapanista kaldirilacak dinleyici. */
export type TrackedHandler = (...args: never[]) => unknown;

/**
 * `removeListener` icin gereken minimum yuzey.
 *
 * discord.js `EventEmitter`'i genisletir; yapilandirilmis tip kullanarak
 * `any` icin gerek kalmadan uyumluluk saglanir.
 */
export interface BindingEmitter {
    removeListener(event: string, handler: TrackedHandler): unknown;
}

export interface RegisteredCommand {
    /** Discord'a kaydedilen ad (`data.name`). */
    readonly name: string;
    readonly data: ChatInputCommandBody;
    readonly execute: CommandExecutor;
    readonly module: string;
    /** Komutun tanimlandigi dosya (varsa). */
    readonly source: string | null;
}

export interface RegisteredEvent {
    readonly event: string;
    readonly module: string;
    readonly source: string | null;
    readonly once: boolean;
    readonly handler: TrackedHandler;
}

export interface EventBinding {
    readonly emitter: BindingEmitter;
    readonly event: string;
    readonly handler: TrackedHandler;
}

/**
 * Discord slash komut adi normalizasyonu.
 *
 * Discord komut adlarini kucuk harfe indirger ve `interaction.commandName`
 * daima kucuk harfle gelir; kayit tarafi da ayni kurali uygulamalidir.
 */
export function normalizeCommandName(name: string): string {
    return name.trim().toLowerCase();
}

export interface DisposerReport {
    readonly ran: number;
    readonly failed: number;
}

/**
 * Bir anin kayit durumu.
 *
 * Modul yuklemesi basarisiz olursa o ana kadar eklenen tum kayitlar
 * geri alinir; boylece yarim yuklenmis modul artik iz birakmaz.
 *
 * Komutlar sayiyla degil **degerle** saklanir: bir modul ayni adi baska
 * bir komutun uzerine yazabilir ve geri alindiginda onceki kaydin yerine
 * konmasi gerekir.
 */
export interface RegistrySnapshot {
    readonly commands: ReadonlyMap<string, RegisteredCommand>;
    readonly events: number;
    readonly bindings: number;
    readonly disposers: number;
}

/**
 * Komut, event ve temizlik kayitlarinin tutuldugu tek depo.
 *
 * Event baglantilari ayrica saklanir; boylece `stop()` sirasinda
 * yalnizca framework'un ekledigi dinleyiciler sokolur.
 */
export class Registry {
    private readonly commandMap = new Map<string, RegisteredCommand>();

    private readonly eventList: RegisteredEvent[] = [];

    private readonly bindings: EventBinding[] = [];

    private readonly disposers: (() => unknown | Promise<unknown>)[] = [];

    get commands(): Map<string, RegisteredCommand> {
        return this.commandMap;
    }

    get events(): readonly RegisteredEvent[] {
        return this.eventList;
    }

    get count(): number {
        return this.commandMap.size;
    }

    get disposerCount(): number {
        return this.disposers.length;
    }

    /**
     * Komut ekler.
     *
     * Anahtar `data.name` degeridir; Discord slash adlarini kucuk harfe
     * indirdigi icin ayni normalizasyon burada da yapilir. Boylece
     * `getCommand("PING")` ile `getCommand("ping")` ayni kaydi bulur.
     */
    addCommand(command: RegisteredCommand): void {
        const name = normalizeCommandName(command.name);
        const record = name === command.name ? command : { ...command, name };

        this.commandMap.set(name, record);
    }

    getCommand(name: string): RegisteredCommand | undefined {
        return this.commandMap.get(normalizeCommandName(name));
    }

    hasCommand(name: string): boolean {
        return this.commandMap.has(normalizeCommandName(name));
    }

    addEvent(binding: RegisteredEvent): void {
        this.eventList.push(binding);
    }

    trackBinding(binding: EventBinding): void {
        this.bindings.push(binding);
    }

    addDisposer(disposer: () => unknown | Promise<unknown>): void {
        this.disposers.push(disposer);
    }

    /** Kapanista cagrilacak tum temizlik fonksiyonlari. */
    async runDisposers(): Promise<DisposerReport> {
        const pending = this.disposers.splice(0, this.disposers.length);
        let failed = 0;

        for (const disposer of pending) {
            try {
                await disposer();
            } catch {
                failed++;
            }
        }

        return { ran: pending.length - failed, failed };
    }

    /** Yalnizca framework'un ekledigi event dinleyicilerini kaldirir. */
    detachBindings(): number {
        let removed = 0;

        for (const binding of this.bindings) {
            binding.emitter.removeListener(
                binding.event,
                binding.handler as (...args: unknown[]) => void
            );
            removed++;
        }
        this.bindings.length = 0;

        return removed;
    }

    commandNames(): string[] {
        return [...this.commandMap.keys()].sort((a, b) => a.localeCompare(b));
    }

    /** Anlik kayit durumunu dondurur; `rollback` ile esitlenir. */
    snapshot(): RegistrySnapshot {
        return {
            commands: new Map(this.commandMap),
            events: this.eventList.length,
            bindings: this.bindings.length,
            disposers: this.disposers.length
        };
    }

    /**
     * Verilen andan sonra eklenen kayitlari geri alir.
     *
     * Komutlarda eklenenler silinir, **ezilen eski kayitlar yerine konur**;
     * event dinleyicileri sokulur. `runtime.commands` listesi degistirilmez
     * (cagiran taraf temizler).
     */
    rollback(snapshot: RegistrySnapshot): void {
        for (const name of [...this.commandMap.keys()]) {
            if (!snapshot.commands.has(name)) {
                this.commandMap.delete(name);
            }
        }

        for (const [name, command] of snapshot.commands) {
            if (this.commandMap.get(name) !== command) {
                this.commandMap.set(name, command);
            }
        }

        for (const binding of this.bindings.slice(snapshot.bindings)) {
            binding.emitter.removeListener(
                binding.event,
                binding.handler as (...args: unknown[]) => void
            );
        }

        this.eventList.length = snapshot.events;
        this.bindings.length = snapshot.bindings;
        this.disposers.length = snapshot.disposers;
    }

    reset(): void {
        this.commandMap.clear();
        this.eventList.length = 0;
        this.bindings.length = 0;
        this.disposers.length = 0;
    }
}
