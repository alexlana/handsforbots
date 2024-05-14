##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../README.md) / [plugins](../plugins.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../pt-br/plugins/guided.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./guided.md)

</div>


  # GUIDed Plugin


  The GUIDed plugin empowers your chatbot to provide interactive, step-by-step tutorials to users, guiding them through various features or functionalities of your web application. This plugin enhances user engagement and helps them learn by doing.


  ## How it Works


  The GUIDed plugin utilizes a sequence of steps, each defined as a JSON object, to create a guided experience. These steps can be either modal dialogs or context-sensitive balloons that point to specific elements on your webpage.


  ### Step Structure


  Each step in the tutorial sequence should adhere to one of the following formats:


  #### Modal Step


  ```json

  {
    "type": "modal", 
    "title": "Modal Title",
    "text": "Explanatory text for the user",
    "btn_next": "Next Button Text"  // Optional, defaults to language-specific "Next >>"
    "btn_previous": "Previous Button Text"  // Optional, defaults to language-specific "<< Previous"
    "btn_close": "Close Button Text" // Optional, defaults to language-specific "Close [x]"
  }

  ```


  #### Balloon Step


  ```json

  {
    "type": "balloon",
    "title": "Balloon Title",
    "text": "Explanatory text for the user",
    "dom_element": "#elementId" // The CSS selector for the target DOM element
    "btn_next": "Next Button Text"  // Optional
    "btn_previous": "Previous Button Text"  // Optional
    "btn_close": "Close Button Text" // Optional
  }

  ```


  ### Sequence Example


  ```json

  [
    {
      "type": "modal",
      "title": "Welcome to the Tutorial",
      "text": "This guide will walk you through the key features of our application."
    },
    {
      "type": "balloon",
      "title": "Save Button",
      "text": "Click this button to save your work.",
      "dom_element": "#saveButton"
    },
    {
      "type": "balloon",
      "title": "Navigation Menu",
      "text": "Use this menu to navigate between different sections.",
      "dom_element": "#navigationMenu"
    },
    {
      "type": "modal",
      "title": "Tutorial Complete",
      "text": "Congratulations! You've completed the tutorial.",
      "btn_close": "Got it!" 
    }
  ]

  ```


  ## API Reference


  ### Constructor


  ```javascript

  constructor(bot, options)

  ```


  **Parameters:**


  - `bot`: The initialized instance of the `Bot` class.

  - `options`: An object containing configuration options:
    - `sequence`: (Optional) An array of step objects defining the tutorial. If not provided, you can use `newGuide()` to start a tutorial later.
    - `wait_user`:  (Optional) If `true`, the tutorial will wait for user input (e.g., button clicks) to proceed to the next step. If `false`, the tutorial will auto-advance based on timing or other triggers. Defaults to `true`. 
    - `auto_start`: (Optional)  If `true`, the tutorial will start automatically when the plugin is loaded. Defaults to `false`.
    - `skip`: (Optional) Custom text for the "Skip this guide" link. Defaults to a language-specific equivalent.

  ### Methods


  #### `output(payload)`


  This method is not currently used by the GUIDed plugin, as it primarily handles user interface events and chatbot triggers.


  #### `redirectedInput(payload)`


  Captures user input during a guided tutorial, allowing for navigation using text commands or buttons. 


  #### `newGuide(sequence)`


  Starts a new guided tutorial using the provided sequence of steps.


  ```javascript

  newGuide(sequence)

  ```


  **Parameters:**


  - `sequence`: An array of step objects defining the tutorial.


  #### `ui(options)`


  Creates the user interface elements for the tutorial, including modals, balloons, and navigation buttons.


  #### `navigate(direction)`


  Navigates through the tutorial steps based on user input or commands.


  ```javascript

  navigate(direction)

  ```


  **Parameters:**


  - `direction`: An integer indicating the navigation direction: 
    - `1`:  Forward to the next step.
    - `-1`: Back to the previous step.
    - `0`:  Cancel or skip the tutorial.

  #### `nextStep()`


  Advances to the next step in the tutorial sequence.


  #### `button(direction, el)`


  Creates an HTML button for navigating through the tutorial steps.


  #### `skip()`


  Creates the "Skip this guide" link, allowing users to exit the tutorial.


  #### `footerButtons(message, current, total)`


  Generates the HTML for the navigation buttons (Next, Previous, Close) within a modal or balloon. 


  #### `modal(message, current, total)`


  Creates and displays a modal dialog step.


  #### `balloon(message, current, total)`


  Creates and displays a balloon step, positioning it near the target DOM element.


  #### `balloonPosition()`


  Calculates the optimal position for a balloon step.


  #### `mask(focus_bounds)`


  Creates a mask overlay to highlight the target DOM element of a balloon step.


  #### `waiting()`


  This method is not currently used by the GUIDed plugin.
