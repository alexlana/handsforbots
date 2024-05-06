# [•_•] Hands for Chatbots

## Quick start

Once you have a back end assistant working, you can use one of the scripts bellow to start your bot interface using minimal configuration.

```
// Init text chatbot using RASA as back end.

import Bot from "./handsforchatbots/Bot.js";

let bot_settings = {

   quick_start: "text"

   engine: "rasa",
   language: "en-US",
   engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook",
};
const bot = new Bot( bot_settings );

```

```
// Init voice chatbot using RASA as back end.

import Bot from "./handsforchatbots/Bot.js";

let bot_settings = {

   quick_start: "voice"

   engine: "rasa",
   language: "en-US",
   engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook",
};
const bot = new Bot( bot_settings );

```

```
// Init text and voice chatbot using RASA as back end.

import Bot from "./handsforchatbots/Bot.js";

let bot_settings = {

   quick_start: "text_and_voice"

   engine: "rasa",
   language: "en-US",
   engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook",
};
const bot = new Bot( bot_settings );

```

There is a lot of other options, but if you define a `quick_start` option, a back end assistant (engine) and a language, you can start to test.

## Basic concepts

For now the **Hands for Chatbots** framework is a conversational framework for browsers and give to chatbots / assistants the hability to interact with GUI and other user interfaces through functions calling. The core do not give to assistants the hability to "view" the screen and do things unless this ability is built into a custom plugin.

It was built using concepts from Ports and Adapters (Hexagonal Architecture) and use custom **event** triggers to connect the core with the plugins / adapters.

### Adapter types

The framework have three adapter types:
- **Backend:** connect the framework to chatbots, assistants, online chat APIs etc
- **Input:** create ways to send data to the back end like text, voice and other
- **Output:** create interfaces to show data from back end to the user like text, audio, images and other

To do:
- **GUI:** will load some visual framework like Botstrap, Material Design or other, and provide chatbot windows, mic button etc.

### Custom commands / function calls

It is the way we can interact with the front end. It is possible to navigate in a website, open an image gallery etc. You can develop a function and then make the back end call it. <u>*You don't need to integrate the function with the framework core*</u>, it will be simple called, so you don't need to work harder, unless you want to take advantage of some of the framework's features.

### Framework folder structure

```
- Bot.js
|- Core
   |- Backend
      |- OpenAI.js
      |- Rasa.js
   |- GUI (to do)
   |- Input
      |- Poke.js
      |- Text.js
      |- TextChatCSS.js
      |- Voice.js
      |- VoiceChatCSS.js
   |- Output
      |- BotsCommands.js
      |- Text.js
      |- Voice.js
|- Libs
      |- EasySpeech.es5.js
      |- EnvironmentDetection.js
      |- EventEmitter.js
      |- js.cookie.min.js
      |- Marked.js
      |- nl2br.js
      |- SpeechRecognition.js
      |- Vosk
      |- VoskConnector.js
      |- WebStorage.umd.min.js
|- Plugins
   |- Backend
   |- GUI (to do)
   |- Input
   |- Output
```

### How to extend the framework

Create your plugin and place it in the `Plugins` folder under the folder of the appropriate adapter type (backend, input or output). Remember, if you want simple functions call, you do not need to create a new plugin, do a simple call (view more in *Functions call* section).

## Development

### Custom plugin

You do not need to create a plugin to actions like "open a popup". In this case you can simple call a function (view more in *Functions call* section).

**When it is better to create a plugin**: if you want to interact with the conversation, access messages, use history... a plugin will be usefull. Explore the **GUIDed** plugin (`/Plugins/Output/GUIDed/`), this adapter can use the user messages to choose a tutorial and navigate through the tutorial.

Your plugin need to be one of the three adapter types described on the beggining of this manual. If you want to create an experience involving user inputs **and** bot outputs you will need to create two plugins, one adapter for each end of interaction.

The plugin must have this minimum files/folder structure:
```
- MyPluginName
  |- MyPluginName.js
```

In the file MyPluginName.js you need to export your class, and the class name need to be the same as the plugin folder and main file:
```
export default class MyPluginName {
  constructor () {
  }
}
```

The **plugin name can only have letters and numbers**, no special characters is allowed.

### Backend plugins

### GUI plugins

### Input plugins

### Output plugins

## Events

The framework requires plugins that interacts with the core using events. To handle events:

1. receive the `bot` variable in your `constructor` method;
2. save it in the `this.bot` variable. Then...
3. to trigger an event, use `this.bot.trigger( 'event_name', [ variable_1_to_send, variable_2_to_send, variable_n_to_send ] )`;
4. to listen an event, use `this.bot.on('event_name', myfunction)`.


### Core

The core triggers the following events:

- **core.loaded**: the core and all plugins are loaded. You can use it to trigger actions as soon as everything is available.
- **core.ui_loaded**: all the UI components, from all plugins, are available.
- **core.input_received**: the core receive a input after it was processed by the source plugin.
- **core.output_ready**: the output received from an conversational framework or agent is available and will be sent to plugins that are listening to the trigger.
- **core.history_added**: the chat / events history was updated.
- **core.history_loaded**: when the framework was started, the messages / events history was loaded from the storage.
- **core.calling_backend**: the core is sending some information to the back end. You can use this event to show some "loading/waiting" component.
- **core.backend_responded**: the core received the response from the back end.
- **Custom event on back end response**: the core received the response from the back end and send the response to the plugin responsible for the input. The plugin want to send the custom event name and listen this event.
- **core.history_cleared**: the history was deleted. It occurs because of privacy, so after a defined time of inactivity the history expires.

The core listen to the following events:

- **core.send_to_backend**: receive the payload to send to back end.
- **core.backend_responded**: this is not to trigger from plugins. On receive this event, the core check if we have queued messages to send to back end.
- **core.spread_output**: receive output to spread to all plugins.
- **core.input**: receive an input to add to history.
- **core.ui_loaded**: count a new UI completely loaded.
- **core.renew_session**: when user interacts, the input plugin can trigger this event to renew user session.
- **core.action_success**: after call a function, get tool use result to send as a response to back end assistant.

## Functions call

