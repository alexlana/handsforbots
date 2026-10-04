---
name: handsforbots-history
description: Read and extend the Hands for Bots (H4B) session history - bot.history, bot.addToHistory, core.history_* events - including recording interface events that don't come from the AI so users can navigate a timeline of decisions, and deciding whether the model should see them. Use when code touches bot.history or addToHistory, when building a history/timeline/undo/"decisions" view on top of H4B, or when chat history disappears, duplicates or is lost after reload.
---

# Hands for Bots — session history

H4B already keeps a per-session history, persisted encrypted in `localStorage`. Extend it instead of building a parallel store: it renews the session, expires together with the conversation, and is what the chat, BotsCommands and the `universal-llm` backend read.

Full guide (en/pt): `docs/en-us/history.md`, `docs/pt-br/history.md` in https://github.com/alexlana/handsforbots.

## The data

```javascript
bot.history          // [ [type, plugin, payload, title], ... ] in arrival order
bot.history_loaded   // true after core.history_loaded
```

| type (core) | plugin | payload |
|---|---|---|
| `'input'` | `'Text'`, `'Voice'`, … | string or object the user sent |
| `'output'` | array of output plugin names | **JSON string** of `[{ text, title, buttons, image, html, do }]` |
| `'feedback'` | `'mcp'` | MCP tool feedback text |

Items have **no timestamp and no id**. Put `ts` and `id` in your own payloads.

## Choose the type before writing code

Ask: *should the model know about this event?*

- **No (navigation, audit, undo):** custom type, e.g. `'ui_event'`. Ignored by the model, the chat redraw and BotsCommands.
- **Yes, and the backend is `universal-llm`:** `type: 'input'` with your own `plugin` name, a string `title`, and `payload.text` holding the sentence the model should read ("The user selected plan Pro"). Not drawn in the chat. Counts toward `dialog_context_window` (default 10), so record only decisions that matter for the next answer.
- **Yes, but the backend is `rasa` / `openai`:** the local history doesn't reach the model. Send the event to the backend instead (Poke input, or your backend's own API) and optionally also record a `'ui_event'` for navigation.

Never use `type: 'output'` for your own items: BotsCommands would `JSON.parse` the payload and run any `do` command in it on every reload.

## Write with the bundled recorder

Copy `scripts/history-recorder.js` into the host project (next to the code that creates the Bot) and use it instead of calling `addToHistory` directly. It handles the three ways direct calls lose data:

1. **Writing before `core.history_loaded`** overwrites the saved history from the previous page with only the new item. The recorder waits.
2. **Overlapping writes:** the crypto Worker's `onmessage` is replaced on every write, so with two writes in flight the first promise never resolves and storage keeps a stale snapshot. The recorder serializes writes and gives up waiting after a timeout so the queue never stalls.
3. **No ids or timestamps:** the recorder adds `id` and `ts`.

```javascript
import { createHistoryRecorder, readHistory } from './history-recorder.js'

const recorder = createHistoryRecorder( bot, { plugin: 'MyApp' } )   // default type 'ui_event'

// navigation only
recorder.record( 'filter_applied', { region: 'south' }, 'Filtered by South region' )

// the model should know too (universal-llm only)
recorder.record( 'plan_selected', { plan: 'pro' }, 'Chose the Pro plan',
  { type: 'input', text: 'The user selected the Pro plan in the pricing table.' } )

// render a timeline
const draw = () => renderTimeline( readHistory( bot ) )               // { index, type, plugin, title, payload }
bot.eventEmitter.on( 'core.history_loaded', draw )
bot.eventEmitter.on( 'core.history_added', draw )
```

`record()` returns a promise with the stored payload. It throws synchronously when `type: 'input'` has no string title (the Text plugin calls `title.trim()` on reload and would crash).

## Navigating to a past decision

The history is append-only: there is no API to edit or delete one item. To "go back" to a decision, restore your app state from that item's payload and then `record()` a new event (`'navigated_to'`, with the target `id`). Don't splice `bot.history`: the next write saves your edit, but the chat and the model can get out of sync. To rebuild the UI after a reload, replay your own `'ui_event'` items from `readHistory(bot, { types: ['ui_event'] })` once, on `core.history_loaded`.

## Things the history will not do for you

- **Expiration is silent.** After 30 idle minutes (fixed), memory and storage are emptied without `core.history_cleared` (that event only fires on `bot.clearStorage()`). Before trusting old entries, check `bot.history.length`; consider a periodic check if the timeline stays on screen.
- **Tabs don't sync history.** Each tab writes its whole in-memory copy; the last writer wins. Don't make the history the only source of truth for multi-tab apps.
- **`storage_side: 'backend'`** keeps the history in memory only.
- **Not a secure vault.** The key lives in the same browser (storage + cookie). No secrets or data that must not stay on the device.
- **`core.history_added` has no arguments.** Read `bot.history[bot.history.length - 1]`.
- **Do not trigger `core.input` to record UI events.** It also notifies Analytics as a sent message and is broadcast to other tabs, where the Text plugin shows it as a user message.

## Checklist

- [ ] Type chosen deliberately (custom vs `input`), and the backend actually reads the local history if the model must see it.
- [ ] All writes go through the recorder (or are awaited one at a time after `core.history_loaded`).
- [ ] Payloads are small, JSON-serializable, carry `id`/`ts`, and contain no secrets.
- [ ] `input` items have a string `title` and a `payload.text`.
- [ ] The timeline redraws on `core.history_loaded` and `core.history_added`, and copes with an emptied history.
- [ ] Tested: record events → reload → items still there, chat unchanged, no command re-runs triggered by your items.
