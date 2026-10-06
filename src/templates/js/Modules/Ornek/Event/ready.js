const { defineEvent } = require("dissora");

/**
 * Event dinleyicisi. Ikinci arguman tip denetimi icindir.
 */
module.exports = defineEvent("ready", client => {
    console.log(`Bot hazir: ${client.user.tag}`);
});
