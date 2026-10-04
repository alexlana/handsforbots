##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../pt-br/history.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./history.md)

</div>


# Session history

Hands for Bots keeps a history of everything that happens in the session: what the user said, what the assistant answered, MCP tool feedback and, if you want, **events from your own interface**. The history lives in memory (`bot.history`), is saved encrypted in `localStorage`, and is used to:

- redraw the chat when the page reloads (Text plugin);
- re-run `[•…•]` commands that were already emitted, restoring the GUI state (BotsCommands plugin);
- give conversation context to the model (`universal-llm` backend).

This guide shows how to read the history, how to add items that don't come from the AI, and what to watch out for.


## Item format

Each item is a four-position array:

```javascript
[ type, plugin, payload, title ]
```

| Position | Field | Description |
|---|---|---|
| 0 | `type` | Item type. The core uses `'input'`, `'output'` and `'feedback'`. You can use your own types. |
| 1 | `plugin` | Who produced the item. A string (`'Text'`, `'poke'`, `'mcp'`…) or, for `output`, the list of active output plugins. |
| 2 | `payload` | The data. Must be JSON-serializable. |
| 3 | `title` | Optional display text. May be `null`. |

What the core records:

| `type` | When | `payload` |
|---|---|---|
| `'input'` | An input plugin triggers `core.input` | What the user sent (string or object) |
| `'output'` | The core spreads a response (`core.spread_output`) | **JSON string** of a message array (`[{ text, title, buttons, image, html, do, … }]`) |
| `'feedback'` | An MCP tool returns feedback | Feedback text; `plugin` is `'mcp'` |

> **Note:** items have **no timestamp and no id**. If you need to sort by time or reference an item, put `ts` and `id` inside your `payload`.


## Reading the history

```javascript
bot.history          // Array with every item, in arrival order
bot.history_loaded   // true once the history has been restored from storage
```

The history is only reliable **after** the `core.history_loaded` event, which fires once plugins are loaded and the saved history is decrypted:

```javascript
bot.eventEmitter.on( 'core.history_loaded', () => {
  render( bot.history )
})

bot.eventEmitter.on( 'core.history_added', () => {
  const last = bot.history[ bot.history.length - 1 ]
  // the event carries no data; read the last position
})
```

To normalize the two `payload` shapes:

```javascript
function readPayload ( item ) {
  const [ type, , payload ] = item
  if ( type === 'output' && typeof payload === 'string' ) {
    try { return JSON.parse( payload ) } catch ( e ) { return payload }
  }
  return payload
}
```


## Adding events from your interface

Use `bot.addToHistory`:

```javascript
await bot.addToHistory( type, plugin, payload, title = null )
```

- `type`, `plugin` and `payload` are required. Empty values (`''`, `null`, `0`) throw.
- Each call renews the session and rewrites the whole history, encrypted, to storage.
- After saving, the core triggers `core.history_added`.

### Choosing the `type`

The `type` decides who sees the item:

| Who reads the history | What it considers | A custom `type` (e.g. `'ui_event'`) | `type: 'input'` with a custom `plugin` |
|---|---|---|---|
| `universal-llm` backend (model context) | only `input` and `output` | ignored | **sent** to the model as a user message |
| Text plugin chat (on reload) | `input` with `plugin: 'Text'`, and `output` | ignored | ignored |
| BotsCommands (on reload) | `output` with a `do` command | ignored | ignored |
| Your code | everything | available | available |

The `rasa`, `openai` and `insecure-local-ollama` backends don't read the local history: their context lives on the server.

**Navigation only (the model doesn't see it):**

```javascript
await bot.addToHistory(
  'ui_event',
  'MyApp',
  { action: 'filter_applied', data: { region: 'south' }, ts: Date.now(), id: crypto.randomUUID() },
  'Filtered by South region'
)
```

**So the model also knows (`universal-llm` backend):**

```javascript
await bot.addToHistory(
  'input',
  'MyApp',
  { text: 'The user applied the filter region = South', ts: Date.now() },
  'Filtered by South region'   // for 'input' items, always pass a text title
)
```

The model receives `payload.text` (or `payload.message` / `payload.content`); without those fields it receives the whole object as JSON. `input` and `output` items count toward the `engine_specific.dialog_context_window` (default `10`), so too many interface events push the real conversation out of context.

### `addToHistory` or `core.input`?

Triggering `core.input` also records an `input` item, but does more: it triggers `core.input_received`, notifies the Analytics plugin (`message_sent`) and **replicates the input to other tabs**, where the Text plugin shows it as a user message. For interface events, prefer `bot.addToHistory`.


## Important caveats

### 1. Wait for the history to load

If you call `addToHistory` before `core.history_loaded`, the item is written over a still-empty history and **erases the saved history** from the previous page. Wait for the event or check `bot.history_loaded`:

```javascript
function historyReady ( bot ) {
  if ( bot.history_loaded ) return Promise.resolve()
  return new Promise( resolve => bot.eventEmitter.on( 'core.history_loaded', () => resolve() ) )
}
```

### 2. Don't write in parallel

Encryption uses a single Web Worker, and each write replaces its `onmessage`. If two `addToHistory` calls overlap, the first promise **never resolves** and storage may miss the second item (memory stays correct; the loss shows up on reload). Write one item at a time, with `await`, and use a timeout so your queue doesn't stall if a core write happens to overlap with yours:

```javascript
let queue = Promise.resolve()

function record ( bot, type, plugin, payload, title = null ) {
  const task = queue.then( async () => {
    await historyReady( bot )
    await Promise.race([
      bot.addToHistory( type, plugin, payload, title ),
      new Promise( resolve => setTimeout( resolve, 3000 ) ),
    ])
  })
  queue = task.catch( err => console.error( 'Failed to record history item:', err ) )
  return task
}
```

### 3. Expiration and clearing

- The session expires after **30 minutes** without interaction (fixed value). Any `addToHistory` renews the session.
- On expiration, the history is emptied in memory and in storage **without triggering an event**. `core.history_cleared` is only triggered by `bot.clearStorage()`. If your interface shows the history, check `bot.history.length` before relying on old data.
- With `storage_side: 'backend'`, nothing is saved in the browser: the history only exists while the page is open.

### 4. Multiple tabs

Each tab keeps its own copy of `bot.history` and writes the whole copy to storage. Items added in one tab don't show up in the others, and the last tab to write wins. If your app is often open in several tabs, don't use the history as the only source of truth.

### 5. Sensitive data

The history is encrypted, but the key lives in the browser itself (storage + cookie). Don't store passwords, tokens or data that must not stay on the user's device.


## Full example: decision timeline

```javascript
import Bot from './handsforbots/Bot.js'

const bot = new Bot( bot_settings )

let queue = Promise.resolve()
const ready = () => bot.history_loaded
  ? Promise.resolve()
  : new Promise( r => bot.eventEmitter.on( 'core.history_loaded', () => r() ) )

function recordDecision ( action, data, title ) {
  const item = { action, data, ts: Date.now(), id: crypto.randomUUID() }
  const task = queue.then( async () => {
    await ready()
    await Promise.race([
      bot.addToHistory( 'ui_event', 'MyApp', item, title ),
      new Promise( r => setTimeout( r, 3000 ) ),
    ])
    return item
  })
  queue = task.catch( console.error )
  return task
}

function timeline () {
  return bot.history.map( ( [ type, plugin, payload, title ], index ) => ({
    index,
    type,
    plugin,
    title: title || ( typeof payload === 'string' && type !== 'output' ? payload : null ),
    payload: type === 'output' ? JSON.parse( payload ) : payload,
  }))
}

bot.eventEmitter.on( 'core.history_loaded', () => draw( timeline() ) )
bot.eventEmitter.on( 'core.history_added', () => draw( timeline() ) )

document.querySelector( '#region-filter' ).addEventListener( 'change', e => {
  recordDecision( 'filter_applied', { region: e.target.value }, `Filtered by ${ e.target.value }` )
})
```


## Quick reference

| API | Description |
|---|---|
| `bot.history` | Array of `[type, plugin, payload, title]` items |
| `bot.history_loaded` | `true` once the saved history has been restored |
| `await bot.addToHistory(type, plugin, payload, title)` | Adds an item, renews the session and saves |
| `bot.clearStorage()` | Erases the history and triggers `core.history_cleared` |
| `bot.renewSession()` | Renews the session and triggers `core.history_renewed` |
| `core.history_loaded` | History restored at startup |
| `core.history_added` | An item was added (no data in the event) |
| `core.history_cleared` | `bot.clearStorage()` was called |
| `core.history_renewed` | The session was renewed |

See also: [Events](./events.md) · [Text (input)](./core/input/text.md) · [Bots Commands](./core/output/botscommands.md)
