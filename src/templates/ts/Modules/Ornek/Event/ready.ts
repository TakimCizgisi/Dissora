import type { Client } from "discord.js";
import { defineEvent } from "dissora";

/**
 * Event dinleyicisi. Ikinci arguman tip denetimi icindir.
 */
export default defineEvent("ready", (client: Client) => {
    console.log(`Bot hazir: ${client.user?.tag ?? "bilinmiyor"}`);
});
