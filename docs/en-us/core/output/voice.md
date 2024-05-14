##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../../README.md) / [core](../../core.md) / [output](../output.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../../pt-br/core/output/voice.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./voice.md)

</div>


  # Voice Output Plugin


  The Voice output plugin gives your chatbot a voice, allowing it to speak its responses to the user using text-to-speech (TTS). This plugin leverages the EasySpeech library for cross-browser compatibility and high-quality speech synthesis.


  ## API Reference


  ### Constructor


  ```javascript

  constructor(bot)

  ```


  **Parameters:**


  - `bot`: The initialized instance of the `Bot` class.


  ### Methods


  #### `output(payload)`


  Speaks the chatbot's response using the selected TTS voice. Ignores output if the voice is muted. 


  ```javascript

  async output(payload)

  ```


  **Parameters:**


  - `payload`: The chatbot's response as an array of objects (following the Hands for Bots response format).


  #### `initSpeech(say_no_text = false)`


  Initializes the EasySpeech library and selects the appropriate TTS voice. 


  **Parameters:**


  - `say_no_text`: (Optional) If `true`, EasySpeech will be initialized but won't speak any initial text. Useful for mobile platforms where user interaction is required to activate audio. Defaults to `false`.


  #### `ui(options)`


  Creates the UI for the voice output plugin, which typically includes a mute/unmute button. 


  **Parameters:**


  - `options`: An object containing configuration options:
    - `name`:  (Optional) The name of the preferred TTS voice (if available). If not provided, the plugin will attempt to select a voice based on the bot's language setting.

  #### `waiting()`


  This method is not currently used by the Voice output plugin.
