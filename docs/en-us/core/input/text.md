##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../../README.md) / [core](../../core.md) / [input](../input.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../../pt-br/core/input/text.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./text.md)

</div>


  # Text Input Plugin


  The Text input plugin is the most basic input channel, enabling users to interact with your chatbot through a traditional text chat interface. It captures user text input, adds it to the conversation history, and sends it to the backend engine for processing. 


  ## API Reference


  ### Constructor


  ```javascript

  constructor(bot, options)

  ```


  **Parameters:**


  - `bot`: The initialized instance of the `Bot` class.

  - `options`: An object containing configuration options for the text input UI:
    - `container`:  (Optional) The DOM element where the chat UI will be appended (e.g., `'#chatbot'`, `'body'`). Defaults to `'body'`. 
    - `start_open`: (Optional) If `true`, the chat window will be open by default. Defaults to `false`.
    - `bot_avatar`: (Optional) URL or base64-encoded image data for the bot's avatar. Defaults to a placeholder image.
    - `bot_name`: (Optional) The name to display for the chatbot. Defaults to "The bot" or a language-specific equivalent.
    - `bot_job`: (Optional)  A job title or short description to display below the bot's name. Defaults to an empty string.
    - `no_css`: (Optional) If `true`, the plugin will not include its default CSS styles. You'll need to provide your own styling. Defaults to `false`.
    - `title`: (Optional) The title to display in the chat window's header. Defaults to "Come and chat!" or a language-specific equivalent.
    - `autofocus`: (Optional) If `true`, the text input field will automatically receive focus when the chat window is open. Defaults to `false`.

  ### Methods


  #### `input(payload, title = null)`


  Captures user input from the text field, adds it to the conversation history, and sends it to the backend engine. 


  ```javascript

  input(payload, title = null)

  ```


  **Parameters:**


  - `payload`: The text entered by the user.

  - `title`: (Optional) An alternate title to display in the chat history. If not provided, the `payload` will be used as the title.


  #### `insertMessage(title)`


  Internal method to add a message to the chat window's display. 


  #### `receiver(response)`


  Handles the response from the backend engine, re-enabling user input and displaying the bot's messages.


  #### `initialOpenChatWindow(ui_window)`


  An internal method to handle the initial opening of the chat window.


  #### `ui(options)`


  Creates the user interface for the text input, appending it to the specified container.


  #### `messageWrapper(payload, side = 'user', recipient = null)`


  Creates the HTML structure for a chat message bubble.  


  #### `imageWrapper(payload)`


  Creates the HTML for displaying an image within the chat.


  #### `buttonWrapper(title, payload)`


  Creates an HTML button for a chatbot response, triggering user input when clicked. 


  #### `listButtons(buttons = null)`


  Generates HTML for a list of buttons based on the bot's response.


  #### `rebuildHistory(ui_window)`


  Reconstructs the conversation history from the bot's internal history when the plugin is loaded. 


  #### `setChatMarginTop()`


  Internal method to adjust the chat display for proper scrolling.
