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
    - `layout`: (Optional) Interface layout configuration. Can be a predefined layout string or custom configuration object:
      - Predefined layouts: `'default'`, `'compact'`, `'minimalist'`, `'floating'`
      - Custom configuration: Object with specific positioning and appearance properties
    - `responsive`: (Optional) If `true`, enables automatic responsive behavior. Defaults to `true`.
    - `breakpoints`: (Optional) Object defining custom breakpoints for responsiveness (e.g., `{ mobile: 768, tablet: 1024 }`).
    - `positioning`: (Optional) Controls chat window positioning: `'bottom-right'`, `'bottom-left'`, `'top-right'`, `'top-left'`, `'center'`.
    - `position`: (Optional) Main positioning: `'sidebar'` (screen corner) or `'main'` (screen center, full width). Defaults to `'sidebar'`.
- `display_mode`: (Optional) Display mode: `'floating'` (floating with rounded borders) or `'snap'` (snapped to layout, no borders). Defaults to `'floating'`.
- `always_open`: (Optional) If `true`, the chat window stays always open and cannot be closed by the user. Removes the close button and prevents closing. Defaults to `false`.
- `header_layout`: (Optional) Header layout: `'bar'` (traditional bar), `'hidden'` (hidden), `'floating'` (floating at top right). Defaults to `'bar'`.
- `bot_face_layout`: (Optional) Bot face layout: `'bar'` (traditional bar), `'hidden'` (hidden), `'floating'` (floating at top left). Defaults to `'bar'`.
- `animations`: (Optional) Enables/disables interface animations. Defaults to `true`.
- `theme`: (Optional) Color theme: `'auto'`, `'light'`, `'dark'`. Defaults to `'auto'`.

## Layout Combinations

The Text Input plugin supports different combinations of `position` and `display_mode`:

### Sidebar + Floating (Default)
```javascript
{
  position: 'sidebar',
  interaction_mode: 'floating'
}
```
- Floating chat in screen corner
- Rounded borders
- Fixed width (300px)
- Traditional behavior

### Sidebar + Snap
```javascript
{
  position: 'sidebar',
  display_mode: 'snap'
}
```
- Snapped chat in screen corner
- No rounded borders
- Adaptive height (up to 100vh)
- More integrated appearance

### Main + Floating
```javascript
{
  position: 'main',
  interaction_mode: 'floating'
}
```
- Centered chat on screen
- 90% viewport width
- Rounded borders
- Fixed center positioning

### Main + Snap (Full Screen)
```javascript
{
  position: 'main',
  display_mode: 'snap'
}
```
- **Chat occupies full screen width (100%)**
- **Full viewport height (100vh)**
- **No rounded borders**
- **Perfect page integration**
- Ideal for applications that need chat as the main interface

### Full Screen Configuration Example

```javascript
let textInputConfig = {
  plugin: 'Text',
  type: 'input',
  position: 'main',
  display_mode: 'snap',
  start_open: true,
  title: 'Main Chat'
}
```

## Always Open Window

The `always_open` option allows creating a chat window that cannot be closed by the user:

### Features of the `always_open` Option:

- **Removes the close button** (▲) from the header
- **Prevents closing** the window when clicking the header
- **Opens automatically** when the page loads
- **Keeps the window always visible** during navigation
- **Ideal for applications** that use chat as the main interface

### Usage Example:

```javascript
let textInputConfig = {
  plugin: 'Text',
  type: 'input',
  always_open: true,
  position: 'main',
  display_mode: 'snap',
  title: 'Main Chat'
}
```

### Use Cases:

- **Main chat applications**: When chat is the main interface of the application
- **Customer support**: Support chat that should always be available
- **Assistant interfaces**: Virtual assistants that need to be always visible
- **Productivity applications**: Tools that use chat as a central functionality

## Header and Bot Face Layouts

The Text Input plugin offers granular control over header and bot face appearance:

### Header Layouts (`header_layout`):

#### `'bar'` (Default)
- Traditional header integrated with chat
- Title and close button in top bar
- Default system behavior

#### `'hidden'`
- Completely removes the header
- Chat without visible title
- Ideal for minimalist interfaces

#### `'floating'`
- Floating header at top right of screen
- Fixed position, doesn't block content
- Glass effect (backdrop-filter) for transparency
- Hover with visual highlight

### Bot Face Layouts (`bot_face_layout`):

#### `'bar'` (Default)
- Traditional bot bar integrated with chat
- Bot avatar and name in top bar
- Default system behavior

#### `'hidden'`
- Completely removes the bot bar
- Chat without bot visual identification
- Ideal for clean interfaces

#### `'floating'`
- Floating bot bar at top left of screen
- Fixed position, doesn't block content
- Smaller avatar (32x32px) for space efficiency
- Glass effect (backdrop-filter) for transparency

### Configuration Examples:

#### Minimalist Interface
```javascript
let textInputConfig = {
  plugin: 'Text',
  type: 'input',
  header_layout: 'hidden',
  bot_face_layout: 'hidden',
  position: 'main',
  display_mode: 'snap'
}
```

#### Floating Interface
```javascript
let textInputConfig = {
  plugin: 'Text',
  type: 'input',
  header_layout: 'floating',
  bot_face_layout: 'floating',
  position: 'sidebar',
  display_mode: 'floating'
}
```

#### Hybrid Interface
```javascript
let textInputConfig = {
  plugin: 'Text',
  type: 'input',
  header_layout: 'floating',
  bot_face_layout: 'hidden',
  position: 'main',
  display_mode: 'snap'
}
```

### Use Cases by Layout:

#### Floating Header:
- **Productivity applications**: Doesn't block main content
- **Dashboards**: Keeps controls accessible without interference
- **Work interfaces**: Quick access without occupying space

#### Floating Bot Face:
- **Visual assistants**: Constant bot presence without interference
- **Support applications**: Bot identification always visible
- **Chat interfaces**: Bot personality maintained discretely

#### Hidden Elements:
- **Minimalist interfaces**: Total focus on content
- **Pure chat applications**: No visual distractions
- **Custom interfaces**: Total control over appearance

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


  #### `messageWrapper(payload, side = 'user', recipient = null, html = null)`


  Creates the HTML structure for a chat message bubble.

  **Parameters:**

  - `payload`: The message text.
  - `side`: (Optional) The message side (`'user'`, `'bot'`, `'temp'`). Defaults to `'user'`.
  - `recipient`: (Optional) Recipient type (for specific styling like `'error'`). Defaults to `null`.
  - `html`: (Optional) HTML content for inline MCP tools. When provided, replaces the rendered `payload`. Defaults to `null`.  


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


## MCP Tools Integration

The Text Input plugin provides complete support for inline content display from MCP (Model Context Protocol) tools. This enables MCP tools to display their content directly within the chat window, instead of only in external modals.

### How It Works

When an MCP tool returns content with `type: 'inline_content'`, the system:

1. **Processes in BotOrchestrator**: Inline content is detected and processed separately
2. **Injects into Chat**: Content is inserted directly into the message sequence
3. **Saves to History**: Inline content becomes persistent in conversation history
4. **Renders with CSS**: Applies specific styling through the `mcp_inline_content` class

### MCP Return Structure

For an MCP tool to display inline content, it should return:

```javascript
{
  type: 'inline_content',
  data: {
    text: 'Tool summary text',
    html: '<div class="custom-content">Structured HTML</div>',
    images: ['url1.jpg', 'url2.png'], // Optional array of images
    title: 'Content title'
  }
}
```

### MCP Tool Configuration

MCP tools can configure their display mode:

```javascript
// In MCP plugin
constructor(bot, options) {
  this.outputMode = options.outputMode || 'modal' // 'modal' | 'inline' | 'both'
}

getMCPToolDefinition() {
  return {
    name: 'my_tool',
    parameters: {
      // ... other parameters
      outputMode: {
        type: 'string',
        enum: ['modal', 'inline'],
        description: 'How to display the result',
        default: this.outputMode
      }
    }
  }
}
```

### CSS for Inline Content

Inline content automatically receives the `mcp_inline_content` class and can be styled:

```css
.mcp_inline_content {
  /* Styles applied to all MCP inline content */
}

.mcp_inline_content .custom-gallery {
  /* Specific styles for inline galleries */
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}
```

### Usage Examples

**Inline Image Gallery:**
```javascript
// MCP tool returns
{
  type: 'inline_content',
  data: {
    text: 'Gallery: WordPress on GCP',
    html: `
      <div class="inline-gallery-content">
        <h3>WordPress on GCP</h3>
        <div class="inline-gallery-images">
          <figure><img src="image1.jpg"><figcaption>Step 1</figcaption></figure>
          <figure><img src="image2.jpg"><figcaption>Step 2</figcaption></figure>
        </div>
      </div>
    `
  }
}
```

**Documentation Content:**
```javascript
{
  type: 'inline_content',
  data: {
    text: 'Documentation: Plugin Configuration',
    html: `
      <div class="doc-content">
        <h4>Configuration</h4>
        <pre><code>plugin: 'Text', layout: 'compact'</code></pre>
        <p>This configuration enables compact mode...</p>
      </div>
    `
  }
}
```

### Benefits

- **Integrated Experience**: Content appears naturally within the conversation
- **Persistent History**: All content is saved and can be revisited
- **Responsiveness**: Automatically adapts to different screen sizes
- **Flexibility**: Tools can choose between modal or inline dynamically
