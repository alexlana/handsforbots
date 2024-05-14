##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../README.md) / [plugins](../plugins.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../pt-br/plugins/analytics.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./analytics.md)

</div>


  # Analytics Plugin


  The Analytics plugin enables you to track and analyze user interactions with your chatbot. This plugin captures events, messages, and other relevant data and sends it to your chosen analytics service, providing valuable insights into user behavior and conversation patterns.


  ## Configuration


  To use the Analytics plugin, you'll need to provide your analytics service's API key or endpoint during initialization. You can also customize the types of events you want to track.


  ## API Reference


  ### Constructor


  ```javascript

  constructor(bot, options)

  ```


  **Parameters:**


  - `bot`: The initialized instance of the `Bot` class.

  - `options`: An object containing configuration options:
    - `apiKey`: (Required) Your analytics service's API key.
    - `endpoint`: (Optional) The URL of your analytics service's endpoint if it differs from the default.
    - `events`: (Optional) An array of events to track. If not provided, the plugin will track all available events. Available events include:
      - `message_sent`: Triggered when the user sends a message.
      - `message_received`: Triggered when the chatbot receives a message.
      - `button_clicked`: Triggered when the user clicks a button in the chat.
      - `voice_input_started`: Triggered when the user starts speaking using voice input.
      - `voice_input_ended`: Triggered when the user stops speaking using voice input.

  ### Methods


  #### `output(payload)`


  Processes chatbot responses, extracting relevant data and sending it to the analytics service.


  ```javascript

  output(payload)

  ```


  **Parameters:**


  - `payload`: The chatbot's response as an array of objects (following the Hands for Bots response format).


  #### `trackEvent(eventName, data)`


  Tracks a custom event and sends it to the analytics service.


  ```javascript

  trackEvent(eventName, data)

  ```


  **Parameters:**


  - `eventName`: The name of the event to track.

  - `data`: (Optional) An object containing additional data associated with the event.


  #### `ui(options)`


  This plugin does not have a user interface. This method simply signals to the core that the plugin is ready.


  #### `waiting()`


  This method is not currently used by the Analytics plugin.
