import { defineCommand } from "dissora";
import { SlashCommandBuilder } from "discord.js";

/**
 * Slash komutu.
 *
 * `data.name` ayni zamanda calisma anindaki kayit anahtaridir; dosya adini
 * degistirmen yeterlidir, config'de ad tutmaniza gerek yoktur.
 */
export default defineCommand({
    data: new SlashCommandBuilder()
        .setName("ornek")
        .setDescription("Ornek bir komut"),

    execute: async context => {
        await context.interaction.reply("Merhaba! Ben Dissora.");
    }
});
