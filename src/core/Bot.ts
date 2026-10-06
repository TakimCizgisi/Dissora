import {
    ActivityType,
    Client,
    type ClientOptions,
    GatewayIntentBits
} from "discord.js";

import { ConfigService, type ResolvedConfig } from "../config/resolve.js";
import { isLogLevel, Logger, type LogLevel } from "../services/Logger.js";
import { ProjectPaths } from "../services/Paths.js";
import { TimerRegistry } from "../services/TimerRegistry.js";
import type { CommandContext, Disposer } from "../types/context.js";
import { ensureDir } from "../utils/fs.js";
import { VERSION } from "../version.js";
import {
    type ApplicationLike,
    type SyncReport,
    type SyncScope,
    syncCommands
} from "./CommandSync.js";
import {
    type ModulePlanEntry,
    resolveModulePlan
} from "./DependencyResolver.js";
import { createDissoraClient, type DissoraClient } from "./DissoraClient.js";
import { collectModuleCandidates, ModuleHost } from "./ModuleHost.js";
import type { ModuleRuntime } from "./ModuleRuntime.js";
import {
    type BindingEmitter,
    Registry,
    type TrackedHandler
} from "./Registry.js";
import { Shutdown, type ShutdownReason } from "./Shutdown.js";
import { createServices } from "./services.js";

export type BotState =
    | "idle"
    | "loading"
    | "connecting"
    | "ready"
    | "stopping"
    | "stopped";

export interface BotOptions {
    /** Testler icin sahte client uretici. */
    readonly clientFactory?: (intents: number[]) => Client;
    readonly clientOptions?: Partial<ClientOptions>;
    readonly logger?: Logger;
    readonly logLevel?: LogLevel;
    /** BotConfig uzerine calisma zamani override. */
    readonly overrides?: Partial<ResolvedConfig["bot"]>;
    /** Komut kaydi yapilsin mi? Varsayilan: BotConfig.commands.register */
    readonly registerCommands?: boolean;
    /** surec kapaninca cikis kodunu tetiklemek yerine sadece temizlensin. */
    readonly exitOnShutdown?: boolean;
    readonly env?: NodeJS.ProcessEnv;
    readonly skipDotenv?: boolean;
    readonly hooks?: {
        readonly onReady?: (bot: DissoraBot) => void | Promise<void>;
    };
}

const ACTIVITY_TYPES: Readonly<Record<string, ActivityType>> = {
    playing: ActivityType.Playing,
    streaming: ActivityType.Streaming,
    listening: ActivityType.Listening,
    watching: ActivityType.Watching,
    competing: ActivityType.Competing,
    custom: ActivityType.Custom
};

/**
 * Bot yasam dongusu.
 *
 * `start()` -> config oku, modulleri yukle, baglan, komutlari kaydet
 * `stop()`  -> temizlik kayitlari, event'ler, zamanlayicilar, baglanti
 *
 * Ornek:
 * ```ts
 * const bot = new DissoraBot(process.cwd());
 * await bot.start();
 * ```
 */
export class DissoraBot {
    readonly paths: ProjectPaths;

    readonly logger: Logger;

    readonly registry = new Registry();

    readonly timers: TimerRegistry;

    readonly modules = new Map<string, ModuleRuntime>();

    readonly config: ResolvedConfig;

    readonly dissora: DissoraClient;

    client: Client | null = null;

    private readonly options: BotOptions;

    private readonly configService: ConfigService;

    private readonly moduleExports = new Map<string, unknown>();

    private readonly startedAt = Date.now();

    private currentState: BotState = "idle";

    private shutdown: Shutdown | null = null;

    private commandRouter: {
        emitter: Client;
        handler: (interaction: unknown) => void;
    } | null = null;

    constructor(projectPath: string, options: BotOptions = {}) {
        this.options = options;
        this.paths = new ProjectPaths(projectPath);

        this.configService = new ConfigService(this.paths.root, {
            env: options.env,
            overrides: options.overrides,
            skipDotenv: options.skipDotenv ?? false
        });

        this.config = this.configService.resolve();

        const level =
            options.logLevel ??
            (isLogLevel(this.config.bot.logging.level)
                ? this.config.bot.logging.level
                : "info");

        this.logger =
            options.logger ??
            new Logger({
                level,
                timestamps: this.config.bot.logging.timestamps
            });

        this.timers = new TimerRegistry(this.logger);

        this.dissora = createDissoraClient({
            bot: this,
            log: this.logger,
            services: createServices(this.registry, this.timers, this.paths),
            version: VERSION,
            exports: this.moduleExports
        });
    }

    get state(): BotState {
        return this.currentState;
    }

    get isReady(): boolean {
        return this.currentState === "ready";
    }

    /** Bot durumunun ozeti; CLI ve `dissora info` icin. */
    summary(): {
        state: BotState;
        total: number;
        loaded: number;
        skipped: number;
        failed: number;
        commands: number;
        events: number;
        timers: number;
        uptime: number;
    } {
        const all = [...this.modules.values()];

        return {
            state: this.currentState,
            total: all.length,
            loaded: all.filter(entry => entry.state === "loaded").length,
            skipped: all.filter(entry => entry.state === "skipped").length,
            failed: all.filter(entry => entry.state === "failed").length,
            commands: this.registry.commands.size,
            events: this.registry.events.length,
            timers: this.timers.size,
            uptime: Math.floor((Date.now() - this.startedAt) / 1000)
        };
    }

    private setState(state: BotState): void {
        this.currentState = state;
    }

    private createClient(): Client {
        const intents: number[] = [];

        for (const name of this.config.bot.intents) {
            const value =
                GatewayIntentBits[name as keyof typeof GatewayIntentBits];

            if (typeof value !== "number") {
                throw new Error(
                    `Gecersiz intent: ${name}. Izin verilenler: ${Object.keys(GatewayIntentBits).join(", ")}`
                );
            }

            intents.push(value);
        }

        const client = this.options.clientFactory
            ? this.options.clientFactory(intents)
            : new Client({
                  intents,
                  ...this.options.clientOptions
              });

        client.commands = this.registry.commands;
        client.dissora = this.dissora;

        this.client = client;

        return client;
    }

    private createModuleHost(): ModuleHost {
        return new ModuleHost({
            bot: this,
            dissora: this.dissora,
            client: this.client as Client,
            logger: this.logger,
            registry: this.registry,
            timers: this.timers,
            paths: this.paths,
            resolved: this.config,
            modulesDirName: this.config.modulesDirName,
            exports: this.moduleExports
        });
    }

    /** Modul klasorlarini okur ve bagimlilik sirali yukleme planini cikarir. */
    planModules(): {
        order: ModulePlanEntry[];
        skipped: { name: string; reason: string }[];
        errors: { name: string; reason: string }[];
    } {
        ensureDir(this.config.modulesDir);

        return resolveModulePlan(
            collectModuleCandidates(
                this.paths,
                this.config.modulesDir,
                this.config.modulesDirName
            )
        );
    }

    private async loadModules(): Promise<void> {
        const plan = this.planModules();

        for (const entry of plan.errors) {
            this.logger.error(`modul hatasi: ${entry.name} - ${entry.reason}`);
        }

        for (const entry of plan.skipped) {
            this.logger.warn(`modul atlandi: ${entry.name} - ${entry.reason}`);
        }

        if (plan.order.length === 0) {
            this.logger.warn(
                `Modul bulunamadi (${this.paths.relative(this.config.modulesDir)}). "dissora create <ad>" ile basla.`
            );

            return;
        }

        const host = this.createModuleHost();

        for (const entry of plan.order) {
            const runtime = await host.load(entry.name, entry.config);

            this.modules.set(entry.name, runtime);
        }
    }

    private attachCommandRouter(client: Client): void {
        const handler = (interaction: unknown): void => {
            const chatInput = interaction as {
                isChatInputCommand(): boolean;
                commandName: string;
                replied: boolean;
                deferred: boolean;
                reply(payload: unknown): Promise<unknown>;
                followUp(payload: unknown): Promise<unknown>;
            };

            if (!chatInput.isChatInputCommand()) {
                return;
            }

            void this.runCommand(client, chatInput);
        };

        client.on("interactionCreate", handler);

        this.commandRouter = { emitter: client, handler };

        this.registry.trackBinding({
            emitter: client as unknown as BindingEmitter,
            event: "interactionCreate",
            handler: handler as TrackedHandler
        });
    }

    /**
     * Komut yonlendiricisini istemciden ayirir.
     *
     * `Shutdown` zaten kayitli baglamalari sokar; bu yedek yol `shutdown`
     * hic kurulamadiginda (`start()` cok erken basarisiz oldu) eski
     * istemciye asili kalan dinleyiciyi temizler.
     */
    private detachCommandRouter(): void {
        const router = this.commandRouter;

        if (router === null) {
            return;
        }

        this.commandRouter = null;
        router.emitter.off("interactionCreate", router.handler);
    }

    private async runCommand(
        client: Client,
        interaction: {
            readonly commandName: string;
            readonly replied: boolean;
            readonly deferred: boolean;
            reply(payload: unknown): Promise<unknown>;
            followUp(payload: unknown): Promise<unknown>;
        }
    ): Promise<void> {
        const command = this.registry.getCommand(interaction.commandName);

        if (!command) {
            this.logger.warn(`islenmeyen komut: /${interaction.commandName}`);

            return;
        }

        const runtime = this.modules.get(command.module);
        const context: CommandContext = {
            interaction: interaction as never,
            client,
            module: command.module,
            config: runtime?.config ?? this.config.bot,
            env: process.env,
            log: this.logger.child(command.module),
            dissora: this.dissora
        };

        try {
            await command.execute(context);
        } catch (error) {
            this.logger.error(
                `/${interaction.commandName} hatasi`,
                error instanceof Error ? (error.stack ?? error.message) : error
            );

            const payload = {
                content: "Komut calistirilirken bir hata olustu.",
                flags: 64
            };

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(payload);
                } else {
                    await interaction.reply(payload);
                }
            } catch {
                // etkilesim artik gecersiz
            }
        }
    }

    private applyBotProfile(client: Client): void {
        const { botName, status, activity } = this.config.bot;
        const user = client.user;

        if (user === null) {
            return;
        }

        if (botName !== null && user.username !== botName) {
            void user.setUsername(botName).catch((error: unknown) => {
                this.logger.warn(`Bot adi guncellenemedi: ${messageOf(error)}`);
            });
        }

        if (activity.name === "") {
            return;
        }

        const activities = [
            {
                name: activity.name,
                type: ACTIVITY_TYPES[activity.type] ?? ActivityType.Playing,
                ...(activity.type === "streaming" || activity.type === "custom"
                    ? { url: activity.url ?? "https://discord.com" }
                    : {}),
                ...(activity.state === null ? {} : { state: activity.state })
            }
        ];

        try {
            user.setPresence({ status, activities });
        } catch (error) {
            this.logger.warn(`Presence guncellenemedi: ${messageOf(error)}`);
        }
    }

    private resolveScope(): SyncScope {
        const { scope } = this.config.bot.commands;
        const guildId = this.guildIdForCommands();

        if (scope === "global") {
            return "global";
        }

        // `guild` isteyen config, guild ID yoksa calisamaz; global'e dusulur.
        return guildId === null ? "global" : "guild";
    }
    /** `DISCORD_GUILD_ID` anlamli bir deger donduruyorsa. */
    private guildIdForCommands(): string | null {
        const guildId = this.config.guildId;

        if (guildId === null) {
            return null;
        }

        const trimmed = guildId.trim();

        if (trimmed === "" || trimmed.toLowerCase() === "all") {
            return null;
        }

        return trimmed;
    }

    private shouldRegister(): boolean {
        return (
            this.options.registerCommands ?? this.config.bot.commands.register
        );
    }

    /** Komutlari Discord'a kaydeder; Discord'a baglanmis olmalidir. */
    async syncCommands(): Promise<SyncReport> {
        const client = this.client;

        if (client === null) {
            throw new Error("Once bot.start() cagrilmali.");
        }

        const guildId = this.guildIdForCommands();
        const scope = this.resolveScope();

        if (
            scope === "global" &&
            guildId === null &&
            this.config.bot.commands.scope === "guild"
        ) {
            this.logger.warn(
                "DISSORA_GUILD_ID tanimli degil, komutlar global olarak kaydedildi."
            );
        }

        const report = await syncCommands(
            client as unknown as ApplicationLike,
            [...this.registry.commands.values()],
            {
                scope,
                guildId,
                prune: this.config.bot.commands.pruneStale
            },
            this.logger
        );

        const parts: string[] = [];

        if (report.created.length > 0) {
            parts.push(`${report.created.length} eklendi`);
        }

        if (report.updated.length > 0) {
            parts.push(`${report.updated.length} guncellendi`);
        }

        if (report.pruned.length > 0) {
            parts.push(`${report.pruned.length} silindi`);
        }

        this.logger.success(
            `komutlar senkronize edildi (${scope})` +
                (parts.length > 0 ? `: ${parts.join(", ")}` : "")
        );

        return report;
    }

    private createShutdown(client: Client): Shutdown {
        const exitOnShutdown = this.options.exitOnShutdown ?? true;

        return new Shutdown({
            logger: this.logger,
            registry: this.registry,
            timers: this.timers,
            client,
            exit: code => {
                if (!exitOnShutdown) {
                    this.setState("stopped");

                    return;
                }

                process.exit(code);
            },
            onFinish: reason => {
                this.logger.info(`durduruldu (${reason})`);
            }
        });
    }

    /** Botu baslatir: modulleri yukler, baglanir, komutlari kaydeder. */
    async start(): Promise<void> {
        if (this.currentState !== "idle" && this.currentState !== "stopped") {
            return;
        }

        // Token once dogrulanir: modul yuklemeden once hata vermesi daha anlasilir
        // ve hicbir zamanlayici baslatmadan durur.
        const token = this.requireToken();

        // Durum gecisi ve client uretimi de `try` icinde: gecersiz intent
        // gibi bir hata `loading` durumunda takili kalmamali, yoksa sonraki
        // `start()` cagrilari da sessizce yoksayilir.
        try {
            this.setState("loading");
            this.logger.info("moduller yukleniyor");

            const client = this.createClient();

            this.attachCommandRouter(client);

            this.shutdown = this.createShutdown(client);
            this.shutdown.register();

            if (this.options.exitOnShutdown ?? true) {
                this.shutdown.guard();
            }

            await this.loadModules();

            this.setState("connecting");

            const started = Date.now();
            const ready = this.waitForReady(client, started);

            this.logger.info("Discord'a baglaniliyor");
            await client.login(token);
            await ready;
        } catch (error) {
            // Yarim kalan durumu temizle: aksi halde zamanlayicilar process'i
            // ayakta tutar ve CLI sonlanmaz.
            await this.stop("error");

            throw error;
        }
    }

    /**
     * `ready` olayini bekler.
     *
     * Olay hiç gelmezse (bad gateway, sessiz baglanti kopmasi) `start()`
     * sonsuza kadar asili kalirdi; bu yuzden istemci hatalari da bekleme
     * durumunu reddeder.
     */
    private waitForReady(client: Client, started: number): Promise<void> {
        return new Promise<void>((resolveReady, rejectReady) => {
            const settle = (): void => {
                client.off("ready", onReady);
                client.off("error", onFailure);
            };

            const onFailure = (error: Error): void => {
                settle();
                rejectReady(
                    error instanceof Error ? error : new Error(String(error))
                );
            };

            const onReady = (): void => {
                settle();
                this.setState("ready");
                this.applyBotProfile(client);

                const summary = this.summary();

                this.logger.success(
                    `${client.user?.tag ?? "bot"} aktif - ${summary.loaded} modul, ${summary.commands} komut, ${summary.events} event, ${summary.timers} zamanlayici (${Date.now() - started}ms)`
                );

                for (const entry of this.modules.values()) {
                    if (entry.state === "failed") {
                        this.logger.warn(
                            `${entry.name} yuklenemedi: ${entry.reason ?? "bilinmeyen hata"}`
                        );
                    }
                }

                void this.runOnReadyHook();
                this.registerCommandsInBackground();

                resolveReady();
            };

            client.once("ready", onReady);
            client.once("error", onFailure);
        });
    }

    private async runOnReadyHook(): Promise<void> {
        try {
            await this.options.hooks?.onReady?.(this);
        } catch (error) {
            // Kullanici hook'u hata firlatirsa botu dusurmemeli, ama
            // sessizce yutmak da dogru olmaz.
            this.logger.error("onReady hook hatasi", messageOf(error));
        }
    }

    private registerCommandsInBackground(): void {
        if (!this.shouldRegister()) {
            this.logger.info("komut kaydi kapali (commands.register: false)");

            return;
        }

        void this.syncCommands().catch((error: unknown) => {
            this.logger.error("komut kaydi basarisiz", messageOf(error));
        });
    }

    private requireToken(): string {
        const token = this.config.token;

        if (token === null || token.trim() === "") {
            throw new Error(
                `Token bulunamadi. ${this.paths.relative(this.paths.envFile)} icindeki DISSORA_TOKEN degerini doldur (veya DISCORD_TOKEN).`
            );
        }

        return token;
    }

    /**
     * Temiz kapanma.
     *
     * Programatik cagrilarda process'i **durdurmaz**; cikis kodunu
     * cagrilan taraf belirler (`dissora dev` yeniden baslatabilir).
     */
    async stop(reason: ShutdownReason = "manual"): Promise<void> {
        if (this.currentState === "stopped" || this.currentState === "idle") {
            return;
        }

        this.setState("stopping");
        await this.shutdown?.run(reason, 0, false);
        this.setState("stopped");

        // `shutdown` yoksa `start()` erken aamada (ornegin gecersiz intent)
        // basarisiz oldu; yine de kayitli zamanlayici varsa process'i
        // ayakta tutmamalisin.
        if (this.timers.size > 0) {
            this.timers.clearAll();
        }

        this.detachCommandRouter();
        this.client = null;
    }

    /** Kapanista calisacak ek temizlik kaydi. */
    onDispose(disposer: Disposer): void {
        this.registry.addDisposer(disposer);
    }

    /** Yeni baslatma icin durumu temizler (`dissora dev`). */
    async restart(): Promise<void> {
        await this.stop("dev-restart");

        // Modul disi (dis) referanslar da temizlenmeli: yeni yuklemede
        // eski modulun export'u `dissora.modules` uzerinden gorunmemeli.
        this.moduleExports.clear();
        this.modules.clear();
        this.registry.reset();
        this.setState("idle");
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
