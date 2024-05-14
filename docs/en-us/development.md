##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../pt-br/development.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./development.md)

</div>


  # Extending Hands for Bots


  Hands for Bots is designed to be highly extensible through its plugin system.  This guide will delve into the library's architecture, plugin types, and how  you can create your own custom plugins to enhance your hybrid conversational  experiences.


  ## Library Folder Structure


  Understanding the organization of the Hands for Bots codebase is essential for  development. Here's a breakdown of the library's key folders:


  ```
  .
  +- Bot.js          // The core of Hands for Bots, handling plugin management and event flow
  +- Core            // Contains built-in core plugins
  |  +- Backend     // Plugins connecting to chatbot backends
  |  |  +- OpenAI.js
  |  |  +- Rasa.js
  |  +- Input       // Plugins for handling user inputs
  |  |  +- Poke.js
  |  |  +- Text.js
  |  |  +- TextChatCSS.js
  |  |  +- Voice.js
  |  |  +- VoiceChatCSS.js
  |  +- Output      // Plugins for presenting chatbot outputs
  |     +- BotsCommands.js
  |     +- Text.js
  |     +- Voice.js
  +- Libs            // External libraries and utilities used by Hands for Bots
  |     +- EasySpeech.es5.js
  |     +- EnvironmentDetection.js
  |     +- EventEmitter.js
  |     +- js.cookie.min.js
  |     +- Marked.js
  |     +- nl2br.js
  |     +- SpeechRecognition.js
  |     +- Vosk
  |     +- VoskConnector.js
  |     +- WebStorage.umd.min.js
  +- Plugins         // The directory for your custom plugins
     +- Backend     // Custom backend plugins
     +- Input       // Custom input plugins
     +- Output      // Custom output plugins
  ```


  ## Plugin Types


  Hands for Bots plugins are categorized into four primary types:


  - **Backend:** These plugins act as the bridge between your front-end interface and your chosen conversational engine (RASA, OpenAI, or others). They handle communication, sending user inputs to the backend and receiving the chatbot's responses.

  - **Input:** Input plugins are responsible for capturing user interactions and converting them into a format suitable for sending to the backend. Common examples include text input, voice recognition, and event triggers.

  - **Output:** Output plugins take the chatbot's responses and present them to the user in a visually engaging and informative way. They handle rendering text, playing audio, displaying images, and more.

  - **GUI:** (To do) These plugins will integrate with visual frameworks like Bootstrap or Material Design, providing pre-built components for chatbot windows, microphone buttons, and other interface elements.


  ## How to Extend the Library


  Hands for Bots encourages customization through the creation of your own plugins. Here's a general guide:


  1. **Choose the Plugin Type:** Determine which type of plugin best suits the functionality you want to add (Backend, Input, or Output).

  2. **Create the Plugin Directory:** Within the `Plugins` folder, create a subfolder for your plugin using its type (e.g., `Plugins/Input/MyInputPlugin`).

  3. **Create the Plugin File:** Inside the plugin directory, create a JavaScript file with the same name as your plugin (e.g., `MyInputPlugin.js`).

  4. **Export Your Class:** In the plugin file, export a JavaScript class with the same name as the plugin. This class will contain the logic for your plugin.  Refer to the Input and Output plugin examples below for the basic structure.


  **Important Naming Conventions:**


  - Plugin names must use only letters and numbers (no spaces or special characters).

  - The plugin's class name, file name, and folder name must all be identical.


  ## Custom Plugin Examples


  ### Input Plugin Example


  ```javascript

  // Plugins/Input/MyInputPlugin/MyInputPlugin.js


  export default class MyInputPlugin {

    constructor(bot) { // Inject the initialized instance of bot
      this.bot = bot;

      // Listen for the backend response event
      this.bot.eventEmitter.on('my_plugin.receiver', (response) => {
        this.receiver(response);
      });
    }

    // Receive user input and send it to the backend
    input(payload) {
      this.bot.eventEmitter.trigger('core.send_to_backend', [{
        'plugin': 'MyInputPlugin', 
        'payload': payload, 
        'trigger': 'my_plugin.receiver'
      }]);
    }

    // Handle the backend response
    receiver(response) {
      // Modify the response if needed

      // Authorize output plugins to display the response
      this.bot.eventEmitter.trigger('core.spread_output', [response]);
    }

    // Append the user interface to the bot
    ui(options) {
      // Code to create and append the UI elements
      // ...

      this.bot.eventEmitter.trigger('core.ui_loaded'); 
    }
  }

  ```


  ### Output Plugin Example


  ```javascript

  // Plugins/Output/MyOutputPlugin/MyOutputPlugin.js


  export default class MyOutputPlugin {

    constructor(bot) { // Inject the initialized instance of bot
      this.bot = bot;

      // Listen for the output ready event
      this.bot.eventEmitter.on('core.output_ready', (payload) => {
        this.output(payload);
      });
    }

    // Handle the chatbot's output
    output(payload) {
      // Code to process and display the output
      // ...
    }

    // Append the user interface to the bot
    ui(options) {
      // Code to create and append the UI elements
      // ...

      this.bot.eventEmitter.trigger('core.ui_loaded');
    }
  }

  ```


  ## Events: The Communication Backbone


  Hands for Bots leverages an event-driven architecture for seamless communication between the core, plugins, and your web application. This allows for loose coupling and flexible interactions.


  ### How Events Work


  1. **Triggering Events:** To initiate an action or notify other parts of the system, you use `this.bot.eventEmitter.trigger('event_name', [data1, data2, ...])`. Replace `event_name` with the specific event you want to trigger and include any relevant data in the array.

  2. **Listening for Events:** To respond to a particular event, use `this.bot.eventEmitter.on('event_name', myFunction)`.  The `myFunction` will be executed when the `event_name` is triggered.


  Refer to the [Events](./events.md) guide for a comprehensive list of core events and how to handle them effectively within your plugins.
