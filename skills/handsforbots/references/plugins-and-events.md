# Hands for Bots — plugins, events and GUI commands

Verified against `Libs/EventEmitter.js`, `Core/BotOrchestrator.js` and `Core/Output/BotsCommands/BotsCommands.js`.

## Event bus

```javascript
bot.eventEmitter.on( 'myapp.saved', ( a, b ) => { ... } )
bot.eventEmitter.trigger( 'myapp.saved', [ a, b ] )   // args ALWAYS in an array
bot.eventEmitter.off( 'myapp.saved' )                 // removes every listener of that name
```

How names are parsed (`resolveNames` / `resolveName`):

- Characters other than letters, digits, space, `,`, `/` and `.` are removed. `core.history_added` → `core.historyadded`. `my-app.done` → `myapp.done`.
- `,`, `/` and spaces split the string into several names (`on('a.x b.y', fn)` registers two).
- In `a.b`, `a` is the event and `b` is the namespace. A third part is ignored.
- `trigger('a')` (no namespace) calls the `a` listeners of **every** namespace.
- `trigger('a.b')` when namespace `b` exists but has no `a` listeners throws `TypeError: Cannot read properties of undefined (reading 'forEach')`. When namespace `b` doesn't exist at all, nothing happens.
- There is no `once`. To listen once, call `off` inside the listener (this removes all listeners with that name) or guard with a flag.

Practical rule: name your events `<yourprefix>.<yourprefix>_<what>` (e.g. `myapp.myapp_saved`) so the namespace is unique, and always pass an array.

## Core events

Triggered by the core:

| Event | Args | When |
|---|---|---|
| `core.loaded` | — | Backend module registered |
| `core.all_ui_loaded` | — | Every plugin called `core.ui_loaded` |
| `core.history_loaded` | — | History restored from storage (safe to read `bot.history`) |
| `core.history_added` | — | An item was added to the history (read the last item) |
| `core.history_cleared` | — | `bot.clearStorage()` was called (not on silent expiration) |
| `core.history_renewed` | — | Session renewed |
| `core.input_received` | — | `core.input` was recorded |
| `core.calling_backend` | — | Request to the backend started |
| `core.backend_responded` | — | Backend answered (internal: drains the queue) |
| `core.output_ready` | `messages[]` | Response ready for output plugins |
| `core.other_window_input` / `core.other_window_output` | payload | Another tab received an input / produced an output |
| `<your trigger>` | `messages[]` | The `trigger` name you passed in `core.send_to_backend` |

Listened by the core:

| Event | Args | Effect |
|---|---|---|
| `core.input` | `[{ plugin, payload, title? }]` | Records an `input` history item, triggers `core.input_received`, broadcasts to other tabs |
| `core.send_to_backend` | `[{ plugin, payload, trigger }]` | Sends to the backend (queued while another call runs); answers on `trigger` |
| `core.spread_output` | `[messages[], force?]` | Extracts commands, records an `output` item, triggers `core.output_ready` |
| `core.ui_loaded` | — | Counts loaded UIs |
| `core.renew_session` | — | Renews the session |
| `core.action_success` | `[{ to_do, result }]` | Forwards a command result to the backend (`backend.actionSuccess`) |
| `core.redirect_input` | `['PluginName']` | Sends every input to `bot.outputs[PluginName].redirectedInput(payload)` instead of the backend; `null` to stop |
| `mcp.tool_feedback_received` | `[{ success, feedback }]` | Records a `feedback` item and shows it |

## Writing a plugin

Location and naming: `handsforbots/Plugins/Input/<Name>/<Name>.js` or `handsforbots/Plugins/Output/<Name>/<Name>.js`, default-exported class named `<Name>`, letters and digits only. Register with `plugins: [{ plugin: '<Name>', type: 'input'|'output', ...options }]`.

Contract:

- `constructor(bot, options)` — store both; register listeners here. Don't touch the DOM yet.
- `ui(options)` — build the UI, then **always** `this.bot.eventEmitter.trigger('core.ui_loaded')`, even with no UI. If one plugin never triggers it, `core.all_ui_loaded` never fires and BotsCommands never replays history.

### Input plugin

```javascript
export default class MyInput {

  constructor ( bot, options ) {
    this.bot = bot
    this.options = options
    this.bot.eventEmitter.on( 'myinput.myinput_receiver', ( messages ) => this.receiver( messages ) )
  }

  input ( payload, title = null ) {
    this.bot.eventEmitter.trigger( 'core.input', [ { plugin: 'MyInput', payload, title: title || String( payload ) } ] )
    this.bot.eventEmitter.trigger( 'core.send_to_backend', [ { plugin: 'MyInput', payload, trigger: 'myinput.myinput_receiver' } ] )
  }

  receiver ( messages ) {
    this.bot.eventEmitter.trigger( 'core.spread_output', [ messages ] )
  }

  ui ( options ) {
    // build UI
    this.bot.eventEmitter.trigger( 'core.ui_loaded' )
  }
}
```

Notes: `core.input` items with a `plugin` other than `'Text'` are not drawn in the chat on reload, but `core.input` is broadcast to other tabs where the Text plugin shows the payload as a user message. Give `input` items a string `title`: the Text plugin calls `title.trim()` on reload and crashes on an object payload without a title.

### Output plugin

```javascript
export default class MyOutput {

  constructor ( bot, options ) {
    this.bot = bot
    this.options = options
    this.bot.eventEmitter.on( 'core.output_ready', ( messages ) => this.output( messages ) )
  }

  output ( messages ) {
    for ( const m of messages ) { /* m.text, m.buttons, m.image, m.html, m.do */ }
  }

  // Callable by the assistant as "MyOutput.highlight" — arrow field keeps `this`
  highlight = ( params ) => {
    document.querySelector( params.selector )?.classList.add( 'h4b-highlight' )
  }

  ui ( options ) {
    this.bot.eventEmitter.trigger( 'core.ui_loaded' )
  }
}
```

## GUI commands (BotsCommands)

Format inside an assistant message (at the end of `text`):

```
Opening the summer collection. [•{"action":"MyOutput.highlight","params":{"selector":"#summer"}}•]
```

- Only the first `[•…•]` block of each message is extracted. The JSON must be valid (double quotes).
- Resolution: `window[action]` first, then `bot.outputs[Class][method]` for `Class.method`. Input plugins are not reachable.
- The function is called as `fn(params)` — detached, so `this` is `undefined` inside class methods. Use arrow-function fields or `this.method = this.method.bind(this)`.
- Returning a Promise currently throws `ReferenceError: response is not defined` inside BotsCommands, so `core.action_success` is never sent. Keep command functions synchronous and return nothing.
- On reload, after `core.all_ui_loaded`, every command in the history runs again, in order. Make commands idempotent (set state, don't toggle; don't re-send network writes). The function gets no flag telling it that it is a replay.
- Missing function → `console.warn('Can not find function ...')`, nothing else.

## MCP tool plugins

An output plugin with `this.isMCPTool = true` and `getMCPToolDefinition()` returning `{ name, description, parameters (JSON schema), execute }` is registered automatically on load. Return `null` to skip registration. Optional `getMCPModelDefinition()` / `getMCPFunctionDefinition()` need `name` and `description`. Inline results (`html`, `text`, `images`) are injected into the chat and saved in the history. Full guide: `docs/en-us/plugins/mcp-tools.md`.
