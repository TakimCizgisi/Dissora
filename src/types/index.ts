/**
 * Public tip yuzeyi.
 *
 * `import type { ... } from "dissora"` yazildiginda buradaki tum tipler
 * kullanilabilir. Ayrica `discord.js` genisletmeleri (Client.commands,
 * Client.dissora) bu dosya yuklendiginde aktif olur.
 */

import "./discord.js";

export type { Client, ClientEvents } from "discord.js";

export type {
    AlwaysModule,
    CommandContext,
    CommandData,
    CommandExecutor,
    CommandModule,
    Disposer,
    EventModule,
    ModuleContext,
    ModuleExports
} from "./context.js";
export type {
    AlwaysDefinition,
    CommandPayload,
    EventDefinition
} from "./define.js";
export { defineAlways, defineCommand, defineEvent } from "./define.js";
