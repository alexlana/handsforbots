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




let guided_settings = {
  plugin: 'GUIDed',
  type: 'output',
  wait_user: true,
  auto_start: true,
  skip: 'Pular o guia',
  sequence: [
    {
      type: 'modal',
      title: 'Welcome',
      text: 'This is the app interface. We want you to know how to do all things here!',
      btn_next: 'Próximo'
    },
    {
      type: 'balloon',
      title: 'Save your work',
      text: 'This button is to save your work. Do not forget to save!',
      dom_element: '#save_button'
    },
    {
      type: 'balloon',
      title: 'Open old work',
      text: 'And this button is to open your old or in process work.',
      dom_element: '#open_button'
    },
    {
      type: 'modal',
      title: 'That\'s all!',
      text: 'Ok! That\'s all, folks!',
      btn_previous: 'Anterior',
      btn_close: 'Entendi!'
    }
  ]
}
bot_settings.plugins.push( guided_settings )




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
