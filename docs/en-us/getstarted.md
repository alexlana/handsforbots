##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../pt-br/getstarted.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./getstarted.md)

</div>


  # Get Started with Hands for Bots


  Welcome to Hands for Bots, a powerful JavaScript library for crafting
  hybrid conversational user interfaces, which unites conversational, graphical and other components. This guide will walk you through the essentials of setting up and using Hands for Bots in your web projects.


  ## Quick Start


  Hands for Bots simplifies the process of integrating conversational interfaces with minimal configuration. All quick start options activates function calls plugin. Let's dive into some quick start examples:


  ### Text Chatbot with RASA


  This example sets up a text-based chatbot using RASA as the back-end conversational engine:


  ```javascript

  import Bot from "./handsforbots/Bot.js";


  let bot_settings = {
    quick_start: "text", 
    engine: "rasa",
    language: "en-US",
    engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook", 
  };


  const bot = new Bot(bot_settings);

  ```


  **Explanation:**


  - `quick_start: "text"`:  This option instructs Hands for Bots to automatically include the core text input and output plugins, creating a basic text chat interface.

  - `engine: "rasa"`: Specifies RASA as the backend engine.

  - `language: "en-US"`: Sets the language for the chatbot interface. *This is not about the language on back end assistants.*

  - `engine_endpoint`:  In this example, the URL of your RASA server's REST webhook endpoint.


  ### Voice Chatbot with RASA


  Here's how you can create a voice-enabled chatbot using RASA:


  ```javascript

  import Bot from "./handsforbots/Bot.js";


  let bot_settings = {
    quick_start: "voice", 
    engine: "rasa",
    language: "en-US",
    engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook", 
  };


  const bot = new Bot(bot_settings);

  ```


  **Explanation:**


  - `quick_start: "voice"`:  Hands for Bots automatically includes the core voice input and output plugins.

  - The rest of the settings are identical to the text chatbot example.


  ### Text and Voice Chatbot with RASA


  To combine both text and voice capabilities:


  ```javascript

  import Bot from "./handsforbots/Bot.js";


  let bot_settings = {
    quick_start: "text_and_voice",
    engine: "rasa",
    language: "en-US",
    engine_endpoint: "http://localhost/rasa/webhooks/rest/webhook", 
  };


  const bot = new Bot(bot_settings);

  ```


  **Explanation:**


  - `quick_start: "text_and_voice"`: Hands for Bots will include both the text and voice plugins, providing a comprehensive CUI.


  Remember to adjust the `language` and `engine_endpoint` to match your setup. You can explore more advanced configurations and customization options in the [Development](./development.md) section of the documentation.


  ## Custom Commands/Function Calls


  Hands for Bots empowers your chatbot to interact directly with your web application through custom commands or function calls. This allows for a wide range of actions, such as:


  - Navigating within your website

  - Displaying image galleries

  - Setting markers on a map

  - Triggering animations


  **Important:** You don't need to tightly integrate these functions with the Hands for Bots core. The library provides a simple mechanism for calling them.


  ### JSON Structure


  To invoke a custom function, you'll need to structure the command as a JSON object within the chatbot's response. Here's the general format:


  **For standard JavaScript functions:**


  ```json

  {
    "action": "FunctionName", // Function name only
    "params": ["param1", "param2", {"param3": "value"}] // Array of parameters (optional)
  }

  ```


  **For methods of Hands for Bots plugins:**


  ```json

  {
    "action": "ClassName.MethodName", // Plugin's class and method name
    "params": ["param1", "param2", {"param3": "value"}] // Array of parameters (optional)
  }

  ```


  **Note:**


  - The `params` array is optional. You can pass a single parameter (string, object, etc.) or omit it entirely if the function doesn't require arguments.


  ### Placement in Chatbot Responses


  To trigger the custom command, include the JSON object, enclosed within the special delimiters `[•` (open) and `•]` (close), at the end of the chatbot's text response.


  **Example for RASA (domain.yml):**


  ```yaml

  responses:
    utter_open_gallery:
    - text: "Here's our gallery: [•{'action': 'displayGallery', 'params': ['summer-collection']}•]"

    utter_set_marker:
    - text: "Marking your location on the map... [•{'action': 'MapPlugin.setMarker', 'params': {'lat': 40.7128, 'lng': -74.0060}}•]"
  ```


  ### Example: Calling a JavaScript Function


  ```javascript

  // Example function to display an image gallery

  function displayGallery(collectionName) {
    // Logic to fetch and display images based on the collection name
    console.log(`Displaying gallery for: ${collectionName}`);
  }


  // ... (Hands for Bots initialization code) ...


  let bot_settings = {
    // ... (your settings) ...
  };


  const bot = new Bot(bot_settings);

  ```


  When the RASA chatbot sends the response `utter_open_gallery`, Hands for Bots will extract the JSON command and call the `displayGallery` function, passing "summer-collection" as the parameter.


  ### Example: Calling a Plugin Method


  Let's say you have a custom "MapPlugin" with a `setMarker` method:


  ```javascript

  // In Plugins/Output/MapPlugin/MapPlugin.js

  export default class MapPlugin {
    // ... (other plugin code) ...

    setMarker(coordinates) {
      // Logic to set a marker on the map using the provided coordinates
      console.log(`Setting marker at:`, coordinates);
    }
  }

  ```


  The response `utter_set_marker` in your RASA domain.yml will invoke the `setMarker` method of the `MapPlugin`.


  ## Docker Playgrounds


  If you're eager to get your hands dirty with Hands for Bots, our Docker playgrounds provide a ready-made environment for experimentation.


  ### Setup


  1. **Download the repository:** [https://github.com/alexlana/handsforbots](https://github.com/alexlana/handsforbots)

  2. **Navigate to the examples directory:** Using your terminal, enter the `./handsforbots/examples/` folder.

  3. **Start the Docker containers:** Run `docker-compose up -d` to start the necessary services (RASA, Vite, etc.).

  4. **Access the playground:** Open [http://localhost/](http://localhost/) in your browser.


  ### Working with the Playground


  - You can modify the Hands for Bots code in the `./handsforbots/` directory.

  - The Vite development server serves the front-end code from `./examples/vite/`.

  - The RASA project is located in `./examples/rasa/`.


  ### Training and Updating Your RASA Model


  To update your chatbot with changes to your RASA project, follow these steps:


  1. **Access the RASA container:** Run `docker exec -it t4b-bot sh` to open a shell within the container.

  2. **Train your model:** Inside the container, execute `rasa train` to retrain the RASA model.

  3. **Exit the container:** Type `exit` to leave the container shell.

  4. **Restart the RASA container:** Run `docker rm -f t4b-bot` followed by `docker-compose up -d` to restart the RASA container with the updated model.


  Your trained model will be saved outside the Docker container in the `./examples/rasa/models/` directory.


  ### Cleanup


  When you're done with the playground, stop the containers using:


  - `docker rm -f t4b-duckling`

  - `docker rm -f t4b-actions`

  - `docker rm -f t4b-bot`

  - `docker rm -f t4b-vite`

  - `docker rm -f t4b-webserver`


  **Important:** This playground setup is intended for local development and experimentation. Do not use it for production deployments.


  Let's move on to understanding the core components and plugin system of Hands for Bots in the [Development](./development.md) guide.
