import Bot from "./handsforbots/Bot.js";

/**
 * Chatbot
 */
let bot_settings = {
  engine: "rasa",
  language: "en-US",
  color: "blue",
  engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook",

  presentation: [
    {
      'text': 'Olá! Sou a assistente virtual que vai atendê-la. Posso orientá-la **sobre os nossos produtos a partir de questões que queira resolver**, ou com **informações de produtos específicos**.'
    }
  ],

  core: [],
  plugins: [],
};

let text_input_config = {
  plugin: "Text",
  type: "input",

  start_open: true,
  // color: "orange",
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
  // name: "Luciana", // pt-BR
  name: "Zarvox", // en-US
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



let guided_settings = {
  plugin: 'GUIDed',
  type: 'output',
  wait_user: true,
  auto_start: false,
  sequence: [
    {
      type: 'modal',
      title: 'Welcome to the guided tutorial',
      text: 'This is the app interface. We want you to know all you can do here!',
      btn_next: 'Let\'s start!'
    },
    {
      type: 'balloon',
      title: 'Save your work',
      text: 'This button is to save your work, but it is fake. Do not forget to save!',
      dom_element: '#save_button'
    },
    {
      type: 'balloon',
      title: 'Open old work',
      text: 'And this button is a fake button to open your old or in progress work that not exists.',
      dom_element: '#open_button'
    },
    {
      type: 'balloon',
      title: 'Ask me',
      text: 'If you have questions, ask me for more information.',
      dom_element: '#chat_input'
    },
    {
      type: 'balloon',
      title: 'Ask me',
      text: 'You can ask using your own voice too.',
      dom_element: '#speech_button'
    },
    {
      type: 'modal',
      title: 'That\'s all!',
      text: 'Ok! That\'s all, folks!',
      btn_previous: '<< Previous',
      btn_close: 'Understood!'
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

// console.log(bot_settings)


const bot = new Bot(bot_settings);

// if (bot.history.length == 0) {
  // bot.input( 'poke', 'Obliviate' );
  // bot.input( 'poke', '__startbot__' );
// }
