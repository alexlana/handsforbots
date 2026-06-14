import Bot from "./handsforbots/Bot.js";
import { maybeInitObservabilityStack } from "./observability-stack.js";

const stack = await maybeInitObservabilityStack();
const stackEnabled = Boolean(stack);

/**
 * Chatbot
 */
let bot_settings = {
  engine: "rasa",
  language: "pt-br",
  engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook",

  core: [],
  plugins: [],
};

let text_input_config = {
  plugin: "Text",
  type: "input",

  start_open: true,
  color: "blue",
  no_css: false,
  container: "#chatbot",
  bot_name: "GUI Assistant",
  bot_job: "Assistant",
  bot_avatar: "./img/bot.png",
  title: "Talk to me!",
  autofocus: false,
};
bot_settings.core.push(text_input_config);

let text_output_config = {
  plugin: "Text",
  type: "output",
};
bot_settings.core.push(text_output_config);

let VTT_ui_config = {
  plugin: "Voice",
  type: "input",
  prioritize_speech: false,
};
bot_settings.core.push(VTT_ui_config);

let voice_ui_config = {
  plugin: "Voice",
  type: "output",
  name: "Luciana", // pt-BR
};
bot_settings.core.push(voice_ui_config);

let bots_commands_config = {
  plugin: "BotsCommands",
  type: "output",
};
bot_settings.core.push(bots_commands_config);

let poke_config = {
  plugin: "Poke",
  type: "input",
};
bot_settings.core.push(poke_config);

let observability_config = {
  plugin: "Observability",
  type: "output",
  environment: stackEnabled ? "development-lgtm" : "development",
  sampleRate: 1,
  exporters: stackEnabled
    ? ["memory", "console", "devPanel", "faro", "otel"]
    : ["memory", "console", "devPanel"],
  exporterConfig: {
    console: { level: "debug" },
    devPanel: { enabled: false },
    faro: stack?.faro ? { client: stack.faro } : {},
    otel: stack ? { api: stack, getTracer: stack.getTracer } : {},
  },
};
bot_settings.plugins.push(observability_config);

  // let hex_presentation_settings = {
  //   plugin: 'HexPresentation',
  //   type: 'output',
  //   root: '../../../../content/portfolio/',
  //   gallery_list: [
  //     'afrolatinas',
  //     'cena',
  //     'dogatwork',
  //     'mapaecologico',
  //     'origo',
  //     'powerfi',
  //     'saptravelheroes',
  //     'skyhub',
  //     'snowland',
  //     'tabata',
  //     'ubec'
  //   ]
  // }
  // bot_settings.plugins.push( hex_presentation_settings )




const bot = new Bot(bot_settings);

if (bot.history.length == 0) {
  // bot.input( 'poke', 'Obliviate' );
  // bot.input( 'poke', '__startbot__' );
}
