##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../../README.md) / [core](../../core.md) / [backend](../backend.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../../pt-br/core/backend/openai.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./openai.md)

</div>


  # OpenAI Backend Plugin


  The OpenAI backend plugin integrates Hands for Bots with OpenAI's powerful language models, allowing you to create sophisticated conversational interfaces. This plugin manages communication between your front-end and the OpenAI API, facilitating the exchange of user messages and bot responses, including support for function calling.


  ## API Reference


  ### Constructor


  ```javascript

  constructor(bot, options)

  ```


  **Parameters:**


  - `bot`: The initialized instance of the `Bot` class.

  - `options`: An object containing configuration options:
    - `endpoint`: (Required) The URL of your OpenAI API endpoint.  
    - `engine_specific`: An object with specific OpenAI configuration:
      - `tools`: (Optional) An array of function definitions for OpenAI's function calling capabilities (see [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)).
      - `assistant_id`: (Optional) The ID of the OpenAI assistant to use for the conversation.

  ### Methods


  #### `send(plugin, payload)`


  Sends a user message to the OpenAI API and returns the chatbot's response.


  ```javascript

  async send(plugin = false, payload)

  ```


  **Parameters:**


  - `plugin`: (Optional) The name of the plugin sending the message. Defaults to `false`.

  - `payload`:  Either:
    -  The user's message as a string (for simple conversations without function calling). 
    - An object with `tool_calls` and `output` properties (for responding to function calls initiated by the OpenAI model).

  **Return Value:**


  - A Promise that resolves to an array of objects representing the bot's responses. Each response object follows the Hands for Bots format:


  ```json

  {
    "recipient_id": "sender_id", // The sender of the message (usually the chatbot's ID)
    "text": "Response text",       // The text content of the response
    "image": "image_url",        // URL of an image (optional)
    "buttons": [                   // Array of buttons (optional)
      { "title": "Button Text", "payload": "button_payload" },
      // ...
    ]
  }

  ```


  #### `receive(payload)`


  This method is not currently used by the OpenAI backend plugin. It's a placeholder for potential future enhancements.


  #### `prepareResponse(bot_dt)`


  An internal method that processes the raw response from the OpenAI API, transforming it into the format expected by Hands for Bots.


  #### `setDefaultTools(engine_specific)`


  Initializes the default functions for OpenAI's function calling feature based on the `engine_specific.tools` configuration.


  #### `setAssistant(engine_specific)`


  Sets the ID of the OpenAI assistant to use, based on the `engine_specific.assistant_id` configuration.


  #### `actionSuccess(response)`


  Handles successful completion of custom actions triggered by the chatbot.  Currently, it's a placeholder for future development.
