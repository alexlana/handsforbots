##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../pt-br/headless.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./headless.md)

</div>


# Headless Mode


Headless mode runs Hands for Bots **without its chat UI**: backend, MCP, action policies, history, tab sync and observability stay in H4B, and the host app renders the conversation with its own components and design system.

For Vue, use the [Vue adapter](./adapters/vue.md), built on top of this mode.


## Usage


```javascript
import { createHeadlessBot, loopDetector } from './handsforbots/Headless/index.js'

const h4b = createHeadlessBot({
  engine: 'rasa',
  engine_endpoint: 'https://my-backend/webhooks/rest/webhook',
  language: 'en-us',
  action_policies: [ loopDetector() ],
})

// state -> host UI
const stop = h4b.subscribe( ( state ) => {
  render( state.messages, state.thinking )
})

// commands the bot can trigger on the GUI, without exposing anything on `window`
h4b.registerCommand( 'Cart.add', ( params ) => cart.add( params.id, params.qty ) )

// user input
h4b.send( 'Two coffees, please' )
h4b.send( '/buy{"id":3}', { title: 'Buy' } ) // payload ≠ displayed text

// on unmount
stop()
h4b.destroy()
```

`createHeadlessBot( options )` takes the same options as `new Bot()`. Plugins without UI (e.g. `Observability`, MCP plugins) keep working. The [Bot's Commands](./core/output/botscommands.md) output is added automatically; pass `commands: false` to turn it off.


## State


`getState()` and `subscribe()` deliver a **new object on every change** (works with React `useSyncExternalStore` and Vue `shallowRef`):

| Field | Description |
|-------|-------------|
| `status` | `'loading'` → `'ready'` (backend registered and history loaded) → `'destroyed'` |
| `thinking` | `true` while waiting for the backend |
| `messages` | User and assistant messages, including the ones restored from history and from other tabs |

Message:

| Field | Description |
|-------|-------------|
| `id` | Stable identifier for `key` |
| `role` | `'user'` or `'assistant'` |
| `text` | Text, without the `[•…•]` command tags |
| `html` | Inline content from MCP tools, when present |
| `buttons`, `images` | As sent by the backend |
| `type`, `source` | E.g. `'inline_mcp_content'` and the tool name |
| `raw` | Original item |

Messages sent before `status === 'ready'` are queued and sent once the bot is ready.


## API


| Method | Description |
|--------|-------------|
| `send( payload, { title } )` | Send a user input |
| `subscribe( fn )` | Listen to state changes; returns the unsubscribe function |
| `getState()` | Current state |
| `on( event, fn )` | Listen to a bot event (e.g. `'core.action_blocked'`); returns the unsubscribe function |
| `registerCommand( name, fn )` | Register a command; returns the function that removes it |
| `addActionPolicy( fn )` | Register an [action policy](./core/action-policies.md) |
| `clear()` | Clear the history |
| `destroy()` | Stop listening and release resources (tab sync channel, crypto worker) |
| `bot` | The `Bot` instance, for advanced use |


## Bot's commands


`registerCommand` is the recommended way to expose GUI actions to the bot in headless mode. The backend keeps the same syntax:

```text
Added to your cart. [•{"action": "Cart.add", "params": {"id": 3, "qty": 2}}•]
```

Command lookup order: registered commands → global function on `window` → `Plugin.method` of an output.


## Limitations


- Browser only (uses `localStorage`, `Worker` and `BroadcastChannel`). With SSR, create the bot on the client only.
- H4B UI plugins (Text, Voice) can be used together, but then their UI shows up too.
