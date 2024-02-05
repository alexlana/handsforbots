import Bot from "./handsforchatbots/Bot.js";

/**
 * Chatbot
 */
let bot_settings = {
  engine: "rasa",
  language: "pt-br",
  engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook",

  inputs: [],
  outputs: [],
  plugins: [],
};

let text_ui_config = {
  plugin: "text",

  start_open: true,
  color: "blue",
  // color: "custom",
  // color_scheme: {
  //   primary: "#96B522",
  //   primary_hover: "#BBD034",
  //   light: "#eaf0c1",
  //   dark: "#96B522",
  //   user: "#f1f5d6",
  // },
  no_css: false,
  container: "#chatbot",
  bot_name: "GUI Assistant",
  bot_job: "Assistant",
  bot_avatar: "./img/bot.png",
  title: "Talk to me!",
  autofocus: false,
};
bot_settings.inputs.push(text_ui_config);

let VTT_ui_config = {
  plugin: "voice",
  prioritize_speech: false,
};
bot_settings.inputs.push(VTT_ui_config);

let voice_ui_config = {
  plugin: "voice",
  name: "Luciana", // pt-BR
};
bot_settings.outputs.push(voice_ui_config);

let bots_commands_config = {
  plugin: "bots_commands",
};
bot_settings.outputs.push(bots_commands_config);

let poke_config = {
  plugin: "poke",
};
bot_settings.inputs.push(poke_config);

const bot = new Bot(bot_settings);

if (bot.history.length == 0) {
  // bot.input( 'poke', 'Obliviate' );
  // bot.input( 'poke', '__startbot__' );
}
