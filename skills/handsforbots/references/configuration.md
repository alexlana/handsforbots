# Hands for Bots — configuration reference

Verified against `handsforbots/Bot.js` and `handsforbots/Core/BotOrchestrator.js`. When the code in the project disagrees with this file, trust the code.

## `new Bot(options)`

| Option | Type | Default | Notes |
|---|---|---|---|
| `engine` | string | `'rasa'` | `'rasa'`, `'openai'`, `'universal-llm'`, `'insecure-local-ollama'`. Case-insensitive. |
| `engine_endpoint` | string | — | URL the backend module calls. |
| `engine_specific` | object | `null` | Passed to the backend module. `universal-llm`: `provider`, `model`, `sessionId`, `dialog_context_window` (default 10). `openai`: `tools`, `assistant_id`. **Never** put API keys here. |
| `language` | string | `'en-us'` | UI language of the core plugins (`'en-us'`, `'pt-br'`). Lower-cased. Not the model's language. |
| `quick_start` | string | — | `'text'`, `'voice'`, `'text_and_voice'`. Pushes core plugin configs into `core` and always adds `BotsCommands`. |
| `core` | array | `[]` | Built-in plugin configs (`handsforbots/Core/...`). |
| `plugins` | array | `[]` | Custom plugin configs (`handsforbots/Plugins/...`). |
| `presentation` | array | — | Messages (`[{ text }]`) spread on start **only when the history is empty**. |
| `disclaimer` | string | — | Shown at the bottom of the chat after the history is redrawn. |
| `color` | string | `'blue'` | `blue`, `green`, `red`, `yellow`, `pink`, `orange`, `purple`, `black`, `gray`, or a custom name with `color_scheme`. |
| `color_scheme` | object | — | `{ primary, primary_hover, light, dark, user }` stored under the name given in `color`. |
| `storage_side` | string | — | `'backend'` disables browser storage: history lives only in memory for the page's lifetime. |

Fixed values (not options): session timeout 30 minutes; command delimiters `[•` and `•]`.

## Plugin config entries

Every entry in `core` or `plugins`:

```javascript
{ plugin: 'Name', type: 'input' | 'output', /* plugin-specific options */ }
```

- `plugin` is sanitized to `[a-zA-Z0-9]` and must equal the folder, file and class name.
- The whole entry is passed to the plugin constructor as `options` and to `ui(options)`.
- Instances are reachable at `bot.inputs[plugin]` / `bot.outputs[plugin]` (keyed by the name as written in the config).
- Loading order: all `core` entries, then all `plugins` entries; constructors first, then every `ui()`.

### Built-in (core) plugins

| Plugin | Type | Common options |
|---|---|---|
| `Text` | input | `container` (default `'body'`), `start_open`, `always_open`, `bot_name`, `bot_job`, `bot_avatar`, `title`, `autofocus`, `no_css`, `position` (`'sidebar'`/`'main'`), `display_mode` (`'floating'`/`'snap'`), `header_layout`, `bot_face_layout`, `theme`, `animations` |
| `Text` | output | — |
| `Voice` | input | `prioritize_speech`, `hide_text_ui` |
| `Voice` | output | `name` (system voice, e.g. `'Luciana'` pt-BR, `'Zarvox'` en-US), `hide_text_ui` |
| `Poke` | input | — (programmatic messages to the backend: `bot.inputs.Poke.input(payload)`) |
| `BotsCommands` | output | — (runs `[•{...}•]` commands) |

### Bundled custom plugins (`handsforbots/Plugins`)

`Photo` (input), `GUIDed` (guided tours), `ImageGallery`, `ShowRelevantContent`, `HexPresentation`, `Analytics`, `Observability` (outputs). Each has a doc under `docs/en-us/plugins/` when documented.

## Backends at a glance

| `engine` | Context of the conversation | Docs |
|---|---|---|
| `rasa` | Rasa tracker (server) | `docs/en-us/core/backend/rasa.md` |
| `openai` | OpenAI Assistants thread (server) | `docs/en-us/core/backend/openai.md` |
| `universal-llm` | Sent from `bot.history` on each call (last `dialog_context_window` input/output items) through a PHP proxy that holds the keys | `docs/en-us/core/backend/universal-llm.md` |
| `insecure-local-ollama` | Local Ollama, development only | `docs/en-us/core/backend/insecure-local-ollama.md` |

## Response message shape (what output plugins receive)

`core.output_ready` delivers an array of messages:

```javascript
[{ text, title, buttons, image, html, recipient_id, do, type, ... }]
```

`do` is the extracted command string (or `null`). `text` already has the command removed.
