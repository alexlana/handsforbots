##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../../README.md) / [core](../../core.md) / [output](../output.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../../pt-br/core/output/botscommands.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./botscommands.md)

</div>


  # Bots Commands Output Plugin


  The Bots Commands output plugin enables your chatbot to trigger custom actions or functions within your web application directly from its text responses. This plugin extracts JSON-formatted commands embedded within the bot's messages and executes the specified actions.


  ## Command Structure


  Commands are defined as JSON objects with the following structure:


  ```json

  {
    "action": "TargetFunction",  // The name of the function or plugin method to call
    "params": ["param1", "param2", { "param3": "value" }]  // An optional array of parameters
  }

  ```


  - **`action`:** Specifies the target function or plugin method to invoke. For standard JavaScript functions, use the function name only. For plugin methods, use `ClassName.MethodName`.

  - **`params`:** An optional array of parameters to pass to the target function.  You can pass a single parameter (string, object, etc.) or omit `params` if the function doesn't require arguments.


  ## Embedding Commands in Responses


  To trigger a command, embed the JSON object within the chatbot's response text, enclosed in special delimiters: `[•` (open) and `•]` (close).


  **Example:**


  ```

  Here's some information. [•{"action": "displayChart", "params": ["sales-data"]}•]

  ```


  ## API Reference


  ### Constructor


  ```javascript

  constructor(bot)

  ```


  **Parameters:**


  - `bot`: The initialized instance of the `Bot` class.


  ### Methods


  #### `output(payload)`


  Processes the chatbot's response, extracts any embedded commands, and executes them.


  ```javascript

  async output(payload)

  ```


  **Parameters:**


  - `payload`: The chatbot's response as an array of objects (following the Hands for Bots response format).


  #### `rebuildHistory()`


  Executes any commands that were present in the bot's conversation history when the plugin loads. Useful for restoring actions from previous sessions.


  #### `ui(options)`


  This plugin does not have a user interface. This method simply signals to the core that the plugin is ready.


  #### `waiting()`


  This method is not currently used by the Bots Commands plugin.
