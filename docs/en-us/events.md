##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../pt-br/events.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./events.md)

</div>


  # Event Handling in Hands for Bots


  Hands for Bots utilizes a robust event-driven architecture for communication and interaction between its core, plugins, and your web application. This approach promotes loose coupling, enabling flexible and extensible development.


  ## Understanding the Event System


  - **Events as Triggers:** Events act as signals that indicate specific actions, state changes, or data availability within the Hands for Bots system.

  - **Triggering Events:** Plugins or your application can trigger events using `this.bot.eventEmitter.trigger('event_name', [data1, data2, ...])`. 
    - Replace `'event_name'` with the specific name of the event you want to trigger.
    - Include any relevant data within the array as parameters to be passed to event listeners. **The second argument must be an array**: anything else is silently dropped and listeners receive no arguments.
  - **Listening for Events:**  To respond to a particular event, use `this.bot.eventEmitter.on('event_name', myFunction)`. The `myFunction` you provide will be executed when the specified event is triggered, receiving the data passed from the trigger. 


  ## Event Naming Rules


  The event emitter has a few rules that are easy to trip over:

  - **Always use `prefix.name`.** The part before the dot is the event and the part after it is a namespace, so `core.history_added` is the event `core` in the namespace `history_added`.

  - **Only letters, digits, `.`, `,`, `/` and spaces are kept.** Underscores and hyphens are removed, so `core.history_added` and `core.historyadded` are the same event, and `my-app.done` becomes `myapp.done`.

  - **Never trigger a name without a dot.** `trigger('myapp')` runs the listeners of every `myapp.*` event.

  - **Triggering `a.b` when nothing listens to `a.b` throws** a `TypeError` if another event already uses the same namespace `b` (for example, triggering `myapp.receiver` when only `poke.receiver` has listeners). Give your plugin events a namespace of their own, or make sure someone listens before you trigger.

  - Names with commas, slashes or spaces register several events at once in `on()`.


  ## Core Events


  Hands for Bots' core triggers several events that enable plugins to interact with the chatbot's lifecycle and data flow. Here's a breakdown of these core events:


  ### Events Triggered by the Core


  - **`core.loaded`:** Emitted when the Hands for Bots core and all plugins have been successfully loaded. Use this event to perform actions that require all components to be available.

  - **`core.all_ui_loaded`:**  Triggered when the UI components of all plugins have been fully loaded and rendered.

  - **`core.input_received`:** Emitted after an input plugin has processed user input and the core has received it.

  - **`core.output_ready`:** Indicates that the chatbot's response from the backend engine is ready and will be sent to output plugins.

  - **`core.history_added`:**  Triggered whenever an item is added to the session history: user inputs, chatbot responses, MCP feedback, or items your application adds with `bot.addToHistory()`. The event carries no data; read `bot.history[bot.history.length - 1]`. See [Session history](./history.md).

  - **`core.history_loaded`:** Emitted when the conversation history has been loaded from storage (if enabled) during the initialization of Hands for Bots.

  - **`core.calling_backend`:**  Indicates that the core is sending a user message to the backend engine. Plugins can use this event to display a loading indicator or other feedback.

  - **`core.backend_responded`:** Signifies that the backend engine has provided a response to the user message.

  - **Custom Event on Backend Response:** The core triggers a custom event specifically for the plugin that initiated the request to the backend. This allows for targeted handling of responses. The plugin is responsible for defining and listening for this custom event. 

  - **`core.history_cleared`:** Emitted when `bot.clearStorage()` is called. **It is not emitted when the session expires**: expiration empties the history silently.

  - **`core.history_renewed`:** Emitted when the session is renewed with `bot.renewSession()` (for example, through `core.renew_session`).

  - **`core.other_window_input` / `core.other_window_output`:** Emitted when another tab or window of the same site received an input or produced an output (via `BroadcastChannel`).


  ### Events Listened for by the Core


  - **`core.send_to_backend`:**  Input plugins use this event to send a user message payload to the backend engine.

  - **`core.backend_responded`:**  This event is handled internally by the core to manage the queue of messages waiting to be sent to the backend. It should not be triggered by plugins.

  - **`core.spread_output`:**  Output plugins use this event to receive the chatbot's response and display it to the user.

  - **`core.input`:**  Triggered by input plugins to register new user input and add it to the conversation history.

  - **`core.ui_loaded`:**  Plugins emit this event to inform the core that their UI component has been loaded. The core uses this to track the loading progress of all plugins.

  - **`core.renew_session`:** Input plugins can trigger this event to extend the user's session, preventing history from being cleared due to inactivity.

  - **`core.action_success`:**  Used to communicate the successful completion of a custom action triggered by a chatbot command. Output plugins that execute these actions should trigger this event.


  ## Example: Handling Events in a Plugin


  ```javascript

  // In MyOutputPlugin.js


  export default class MyOutputPlugin {
    constructor(bot) {
      this.bot = bot;

      // Listen for the output ready event
      this.bot.eventEmitter.on('core.output_ready', (payload) => {
        this.displayResponse(payload);
      });
    }

    displayResponse(payload) {
      // Code to process and display the output
      // ...

      // Trigger an event to inform the core that the response has been displayed
      this.bot.eventEmitter.trigger('myplugin.response_displayed');
    }
  }

  ```


  In this example, the `MyOutputPlugin` listens for the `core.output_ready` event and then triggers its own custom event, `myplugin.response_displayed`, to inform other parts of the system that it has handled the chatbot's response.
