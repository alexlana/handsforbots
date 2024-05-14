##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../../README.md) / [core](../../core.md) / [backend](../backend.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../../pt-br/core/backend/rasa.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./rasa.md)

</div>


  # RASA Backend Plugin


  The RASA backend plugin connects Hands for Bots to a RASA server, enabling your web application to interact with a RASA-powered chatbot. This plugin handles the communication between your front-end and the RASA server, sending user messages and receiving the chatbot's responses.


  ## API Reference


  ### Constructor


  ```javascript

  constructor(bot, options) 

  ```


  **Parameters:**


  - `bot`: The initialized instance of the `Bot` class.

  - `options`: An object containing configuration options:
    - `endpoint`: (Required) The URL of your RASA server's REST webhook endpoint.

  ### Methods


  #### `send(plugin, payload)`


  Sends a user message to the RASA server and returns the chatbot's response.


  ```javascript

  async send(plugin = false, payload)

  ```


  **Parameters:**


  - `plugin`: (Optional) The name of the plugin sending the message. Defaults to `false`.

  - `payload`: The user's message as a string.


  **Return Value:**


  - A Promise that resolves to an array of objects representing the chatbot's responses. Each response object follows the format:


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


  This method is not currently used by the RASA backend plugin. It's a placeholder for potential future enhancements.


  #### `imagesFirst(bot_dt)`


  Internal method that reorders the bot's responses, placing image responses before text responses.  


  #### `actionSuccess(response)`


  This method is currently not used by the RASA backend plugin. It's a placeholder for potential future enhancements related to custom actions.
