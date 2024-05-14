##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../../README.md) / [core](../../core.md) / [input](../input.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../../pt-br/core/input/poke.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./poke.md)

</div>


# Poke Input Plugin


The Poke input plugin provides a mechanism to proactively engage users or trigger actions based on various events or conditions within your web application. This plugin acts as a way for your application to "poke" the chatbot, prompting it to respond or initiate specific behaviors. 


## Purpose


The Poke plugin is useful for:


- **Maintaining Conversation Flow:** Prompting the chatbot to suggest topics or re-engage users after periods of inactivity.

- **Reacting to User Actions:** Triggering chatbot responses based on user interactions with your web application, such as clicking a button, completing a form, or reaching a certain point in a process.

- **Delivering Timed Messages:** Displaying messages to users at specific times or intervals.


## API Reference


### Constructor


```javascript

constructor(bot)

```


**Parameters:**


- `bot`: The initialized instance of the `Bot` class.


### Methods


#### `input(payload)`


Queues a "poke" payload and sends it to the backend engine when the backend is available.


```javascript

input(payload)

```


**Parameters:**


- `payload`:  An object containing information about the poke. The structure of this payload is flexible and can be defined based on your application's needs. Common properties might include: 
  - `time`: A timestamp or time interval. 
  - `event`: The name of an event that triggered the poke.
  - `target_type`: The type of target (e.g., 'plugin', 'function'). 
  - `target_plugin`: The name of a specific plugin or function. 
  - `parameters`: Any additional data relevant to the poke.

#### `receiver(response)`


Handles the response from the backend engine and triggers output plugins to display the response to the user.


```javascript

receiver(response)

```


**Parameters:**


- `response`: The response from the backend engine. 


#### `ui(options)`


This method currently does not create any UI elements, as poke triggers are typically initiated by events or conditions within your web application. 
