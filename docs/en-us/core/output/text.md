##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../../README.md) / [core](../../core.md) / [output](../output.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../../pt-br/core/output/text.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./text.md)

</div>


  # Text Output Plugin


  The Text output plugin is the standard output channel for text-based chatbot interactions. It renders the chatbot's text responses, images, and buttons within a designated area of your web page, typically a chat window.


  ## API Reference


  ### Constructor


  ```javascript

  constructor(bot)

  ```


  **Parameters:**


  - `bot`: The initialized instance of the `Bot` class.


  ### Methods


  #### `output(payload, side = 'bot')`


  Displays the chatbot's responses in the chat window.


  ```javascript

  async output(payload, side = 'bot')

  ```


  **Parameters:**


  - `payload`:  The chatbot's response as an array of objects (following the Hands for Bots response format).  

  - `side`: (Optional) Indicates whether the message is from the 'bot' or the 'user'.  Defaults to 'bot'.


  #### `insertMessage(payload, side)`


  An internal method to add a message to the chat display.


  #### `ui(options)`


  The Text output plugin leverages the UI created by the Text input plugin. This method signals to the core that the UI is ready.


  #### `messageWrapper(payload, side = 'bot', recipient = null)`


  Creates the HTML structure for a chat message bubble, delegating to the `messageWrapper` method of the Text input plugin.


  #### `imageWrapper(payload)`


  Creates the HTML for displaying an image in the chat, delegating to the `imageWrapper` method of the Text input plugin.


  #### `buttonWrapper(title, payload)`


  Creates an HTML button for a chatbot response, delegating to the `buttonWrapper` method of the Text input plugin.


  #### `listButtons(buttons = null)`


  Generates HTML for a list of buttons, delegating to the `listButtons` method of the Text input plugin.


  #### `waiting()`


  Displays a temporary "waiting" message while the bot is processing a response.
