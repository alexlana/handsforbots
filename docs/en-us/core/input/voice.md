##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../../README.md) / [core](../../core.md) / [input](../input.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../../pt-br/core/input/voice.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./voice.md)

</div>


  # Voice Input Plugin


  The Voice input plugin empowers your chatbot with voice recognition capabilities, enabling users to interact through speech. This plugin captures user audio input, converts it to text, and sends it to the backend engine. It supports both native browser speech recognition and Vosk for enhanced accuracy and language support.


  ## API Reference


  ### Constructor


  ```javascript

  constructor(bot)

  ```


  **Parameters:**


  - `bot`: The initialized instance of the `Bot` class.


  ### Methods


  #### `input(payload)`


  This method is not currently used by the Voice input plugin, as it primarily listens for speech recognition events.


  #### `isNative()`


  Checks if the browser natively supports speech recognition.


  ```javascript

  isNative()

  ```


  **Return Value:**


  - `true` if native speech recognition is available, `false` otherwise.


  #### `loadSpeechRecognition()`


  Initializes and loads the appropriate speech recognition engine (either native or Vosk).


  #### `ui(options)`


  Creates the user interface elements for voice input, typically a microphone button.


  **Parameters:**


  - `options`: An object containing configuration options:
    - `prioritize_speech`: (Optional) If `true`, the voice input will be the primary input method on desktop devices. Defaults to `false`.

  #### `removeUi()`


  Removes the voice input UI elements from the DOM and informs the user if there are compatibility issues.


  #### `listenToUser()`


  Starts or stops listening for user speech. Toggles the visual state of the microphone button.


  #### `proccessResults(data)`


  Processes speech recognition results, displaying partial transcripts and sending the final recognized text to the text input field.


  #### `start()`


  Starts the speech recognition engine and sets the plugin's status to 'listening'.


  #### `ignore()`


  Temporarily disables speech recognition, usually when the chatbot is speaking, to prevent the bot's voice from being recognized.


  #### `unignore()`


  Re-enables speech recognition after it has been ignored.


  #### `stop()`


  Stops the speech recognition engine and sets the plugin's status to 'not_listening'.


  #### `cancel()`


  Cancels ongoing speech recognition and resets the plugin's status.


  #### `stopedToListen()`


  Handles the event when speech recognition has stopped and updates the microphone button's visual state.
