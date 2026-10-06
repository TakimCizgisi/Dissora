const { defineCommand } = require("dissora");
const { SlashCommandBuilder } = require("discord.js");

/**
 * Slash komutu.
 *
 * `data.name` ayni zamanda calisma anindaki kayit anahtaridir; dosya adini
 * degistirmen yeterlidir, config'de ad tutmaniza gerek yoktur.
 */
module.exports = defineCommand({
    data: new SlashCommandBuilder()
        .setName("ornek")
        .setDescription("Ornek bir komut"),

    execute: async context => {
        await context.interaction.reply("Merhaba! Ben Dissora.");
    }
});
