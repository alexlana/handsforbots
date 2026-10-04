---
name: handsforbots
description: Integrate the Hands for Bots (H4B) browser library into a web app - set up the Bot, pick a backend engine (rasa, openai, universal-llm, insecure-local-ollama), configure core and custom plugins, let the assistant drive the GUI with [•{...}•] commands (BotsCommands) or MCP tools, write input/output plugins, and listen to core.* events. Use whenever code imports handsforbots/Bot.js, calls new Bot(...), uses bot.eventEmitter, or the user mentions Hands for Bots, H4B or HfB. For anything about the session history (bot.history, addToHistory, timelines of decisions), also load the handsforbots-history skill.
---

# Hands for Bots — integration

Hands for Bots (H4B) is a vanilla-JS, ES-module library that gives a chatbot a front end **and** lets it act on the host page's GUI. Everything talks through one event bus (`bot.eventEmitter`). There is no npm package yet: the `handsforbots/` folder is copied into the host project and imported directly.

Docs (source of truth, bilingual): https://github.com/alexlana/handsforbots/tree/main/docs/en-us — Portuguese under `docs/pt-br`.

## Before writing code

1. Find where the `handsforbots/` folder lives in the project and how it is imported (`import Bot from './handsforbots/Bot.js'`). Plugins are resolved **relative to that folder** (`handsforbots/Core/...` and `handsforbots/Plugins/...`); custom plugins must be placed inside `handsforbots/Plugins/Input|Output/<Name>/<Name>.js`.
2. Find the backend in use (`engine`). It decides where conversation context lives: only `universal-llm` reads the local history; `rasa`, `openai` and `insecure-local-ollama` keep context on the server.
3. Read `references/configuration.md` for options and plugin settings, `references/plugins-and-events.md` before writing a plugin, triggering events or wiring GUI commands.

## Minimal setup

```javascript
import Bot from './handsforbots/Bot.js'

const bot = new Bot({
  engine: 'universal-llm',                 // 'rasa' (default) | 'openai' | 'universal-llm' | 'insecure-local-ollama'
  engine_endpoint: '/api/llm',             // your backend; never put API keys in the front end
  engine_specific: { provider: 'anthropic', model: 'auto', dialog_context_window: 10 },
  language: 'en-US',                       // UI language only
  quick_start: 'text',                     // 'text' | 'voice' | 'text_and_voice' (always adds BotsCommands)
  presentation: [ { text: 'Hi! How can I help?' } ], // shown only when the history is empty
})
```

Without `quick_start`, list plugins explicitly in `core: []` (built-ins) and `plugins: []` (custom). Each entry is `{ plugin: 'Name', type: 'input' | 'output', ...pluginOptions }`.

The page must be served over HTTP(S) (module Web Worker for crypto, `BroadcastChannel`, `localStorage`). Opening the HTML from `file://` breaks it.

## Lifecycle you can rely on

`new Bot()` → plugins constructed → each plugin's `ui()` runs → `core.ui_loaded` per plugin → `core.all_ui_loaded` → history decrypted → `core.history_loaded` → presentation (if history empty). `core.loaded` fires when the backend module is registered, which may happen before or after the UI. Do work that needs the DOM on `core.all_ui_loaded`, and work that needs `bot.history` on `core.history_loaded`.

## Letting the assistant drive the GUI

The assistant appends a command to its text: `Here is the map [•{"action":"showMap","params":{"city":"Recife"}}•]`. The core strips it from the visible text into `message.do`, and BotsCommands runs it:

- `action: "fnName"` → `window.fnName(params)` — expose it with `window.fnName = ...` (module scope is not global).
- `action: "PluginName.method"` → method of an **output** plugin registered under that name.

Rules that bite (see `references/plugins-and-events.md`):
- Plugin methods are called **without `this`**. Define them as arrow-function class fields or bind them in the constructor.
- Don't return a Promise from a command function: the current BotsCommands throws a `ReferenceError` on that path and `core.action_success` never fires. Return nothing, and report back to the assistant another way if needed.
- Every command in the history is **re-run on page reload** (`core.all_ui_loaded`). Commands must be idempotent and safe to replay.
- `params` is passed as one argument (string, object or array).

For richer tools the model can call (with JSON-schema parameters and inline HTML results), write an MCP tool plugin: docs `plugins/mcp-tools.md`.

## Sending things to the assistant from code

- Ask the assistant something without the user typing: add the `Poke` input plugin, then `bot.inputs.Poke.input('__startbot__')` (it waits for the backend to exist).
- Show a message without calling the backend: `bot.eventEmitter.trigger('core.spread_output', [[{ text: 'Saved!' }]])` — note the double array: the trigger args array wrapping the message array.
- Record an interface event in the history (for navigation or model context): use the **handsforbots-history** skill. Don't trigger `core.input` for that.

## Events: three rules that cause silent bugs

1. Args must be an array: `trigger('x.y', [payload])`. A non-array is dropped silently.
2. Names are `prefix.name`; `_` and `-` are stripped (`core.history_added` ≡ `core.historyadded`). Never trigger a bare name without a dot: it fires every `name.*` listener.
3. Triggering `myapp.receiver` with no listener throws if any other event already uses the namespace `receiver`. Give your events a distinctive second part (`myapp.myapp_done`) or register the listener first.

## Checklist before finishing

- [ ] No API keys or secrets in front-end config (`engine_specific`).
- [ ] Custom plugin folder, file and class share the same alphanumeric name; config `plugin` matches it.
- [ ] Output-plugin methods used by commands are arrow functions or bound; command functions are idempotent and return nothing.
- [ ] Every `trigger` passes an array; event names have a dot and a unique namespace.
- [ ] Code touching `bot.history` waits for `core.history_loaded`.
- [ ] Tested in a served page, with a reload in the middle of a conversation (history and command replay).
