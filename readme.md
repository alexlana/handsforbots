# [\*_\*] Hands for Chatbots

## Basic concepts

The **Hands for Chatbots** framework was built using concepts from Ports and Adapters (Hexagonal Architecture).

### Adapter types

The framework have four adapter types:
- Backend: connect the framework to chatbots, assistants, online chat APIs etc
- GUI: load some visual framework like Botstrap, Material Design or other
- Input: create ways to send data to the back end like text, voice and other
- Output: create interfaces to get data from back end to the user like text, audio, images and other

### Custom commands / function calls

It is the way we can interact with the front end. It is possible to navigate in a website, open an image gallery etc. You can develop a class or function and then make the back end call your command / function / method.

### Framework folder structure

```
- Bot.js
|- Core
   |- Backend
      |- OpenAI.js
      |- Rasa.js
   |- GUI
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
   |- GUI
   |- Input
   |- Output
```

### How to extend the framework

Create your plugin and place it in the `Plugins` folder under the folder of the appropriate adapter type.

## Development

### Custom plugin

Your plugin need to be one of the four adapter types described on the beggining of this manual. If you want to create an experience involving user inputs and user outputs you will need to create two plugins, one adapter for each end of interaction.

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

The plugin name can only have letters and numbers, no special characters is allowed.

### Backend plugins

### GUI plugins

### Input plugins

### Output plugins

