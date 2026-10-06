# Hands for Bots v2 — runtime reference

Verified against `packages/core/src/kernel.ts`, `actions.ts`, the transports and `storage-local` / `storage-backend` / `tab-sync`. When the code in the project disagrees with this file, trust the code.

## `createH4B(options)`

| Option | Default | Notes |
|---|---|---|
| `plugins` | `[]` | Mounted on `start()` in dependency order (`inject`); unresolved dependencies throw. |
| `actions` | `[]` | Host actions, registered immediately (before `start()`). |
| `threadId` | random | Conversation id; storage may replace it on restore. |
| `matchThreshold` | `0.75` | Minimum confidence for a direct-command match (menu). |
| `maxActionRoundtrips` | `5` | Assistant ↔ client action rounds per turn before the turn errors. |
| `onError` | `console.error` | Receives listener, storage, matcher and turn errors with a `source`. |

## The queue

Signals (triggers), `runAction` and `push` are jobs processed **one at a time, in arrival order**. Consequences:

- A `runAction` or `push` issued during a slow LLM turn runs only after it. If the GUI must react instantly, change it in your code first.
- `getSnapshot().queued` lists queued **signals** only (so UIs can show pending user messages), not actions or pushes.
- `abort()` cancels the running job; `abort({ clearQueue: true })` also drops the queue. `reset()` does both and clears storage.
- Context signals are not jobs: they apply immediately (after `signal.before` interceptors, if any).

## Routing a trigger

`signal.before` interceptors → most recent `capture` that accepts it (route `capture`) → first matcher above the threshold whose action is exposed to `user` (route `direct`) → transport (route `transport`). The user message is appended with that route before acting.

## What each transport sends

| Transport | History | Context signals | Actions as tools | Notes |
|---|---|---|---|---|
| `agui({ url })` | Full, AG-UI format (tool calls + results) | AG-UI `context` | Yes | CUSTOM `h4b.ui.effect` / `h4b.ui.render` events |
| `http({ url, ... })` | Last 20 as chat messages + `message` | `context` object | `tools` | Customize with `body` / `parse` / `parseChunk` |
| `universalLLM({ url, provider, model })` | Last `contextWindow` (10) + the new message | `context.h4b_context` | `context.tools` | v1 PHP/Laravel backend format |
| `openAICompatible({ baseUrl, model })` | Last `contextWindow` (30) | In the system prompt | native `tools` | Browser key only for localhost |
| `aiSdk({ url })` | Full, as UIMessages | `context` | `tools` (declare without `execute` on the route) | `data-ui-*` parts become effects/render/state |
| `rasa({ url })` | **No** (Rasa keeps its tracker; thread id = sender) | `metadata.h4b_context` | No (Rasa drives the GUI with `custom.h4b`) | `reportActionResults` sends results after assistant-requested actions |
| CopilotKit bridge | The agent's own history; direct commands are mirrored into it | agent context | frontend tools | |

Chat-format history includes recorded actions as assistant `tool_calls` + `tool` messages, including `runAction` calls and failed calls (with `{ error }`).

## Actions: invocation pipeline

`actions.invoke(name, args, { origin })`:

1. Not registered → `not_found`. Not in `exposeTo` for this origin → `forbidden`.
2. `action.before` interceptors (may rewrite; `null` → `declined`).
3. Schema validation (`input` Standard Schema) → `invalid_args`. With only `parameters` (JSON Schema), arguments are **not** validated at runtime.
4. Confirmation when `destructive: true` or `confirm: 'always'`: the `confirm` service decides; **no service → declined**.
5. Handler; thrown errors become `failed`.

Every outcome of a call made inside the kernel (assistant tool call, direct command, `runAction`, agent) is appended to the history as a `tool` message, with `result` or `error`, and emitted as `action.invoked`.

## Stimuli a backend (or `push`) can send

`message.start | message.delta | message.part | message.end` (assistant text and parts), `action.call` (client runs an action), `action.result` (a tool the backend already ran — recorded), `ui.render` (rich content; without `slot` it becomes a `data` part named `ui` in the message, kept in history), `ui.effect` (one-off GUI effect, not in history), `state.snapshot | state.patch` (shared state, JSON Patch), `audio`, `custom`, `error`.

Push an assistant message outside a turn:

```ts
await h4b.push([
  { type: 'message.start', messageId: 'report-1' },
  { type: 'message.delta', messageId: 'report-1', delta: 'Your report is ready.' },
  { type: 'message.end', messageId: 'report-1' },
])
```

## Events (notifications; never block the flow)

`signal`, `context.changed`, `turn.status` (`received → acting → done | error | aborted`, with `route`), `stimulus`, `messages.changed` (fires on every streamed delta), `state.changed`, `action.invoked`, `service.provided`, `service.removed`, `plugin.mounted`, `plugin.disposed`, `error`. A failing listener never breaks others; its error goes to `onError`.

## Storage and tabs

- `storageLocal({ key: 'h4b:conversation', encrypt: true, keySource: cookieKey({ ttlMinutes: 30 }), retention: 'key', userChoices: [], maxMessages: 200 })`: saves after every job (turn, action, push), restores on `start()`, keeps the last `maxMessages`, replaces Blobs with `omitted_media` placeholders. AES-GCM encrypted by default; the key lives in a cookie (`Max-Age` renewed on use, `SameSite=Strict`) or, with `backendKey({ url })`, on the server (`GET` → `{ key }` or 404, `POST` creates). No key → the data is deleted on load or by the 1-minute sweep. `retention`: `'key'` (lasts while the key does), `{ ttlMinutes }` (also deleted after that much inactivity), `'tab'` (sessionStorage). `encrypt: false` → plain JSON. Not an XSS defense.
- `storageBackend({ url, retention: 'server', userChoices: [] })`: `GET`/`PUT`/`DELETE url` with headers `X-H4B-Conversation` (random id in localStorage, sessionStorage for `'tab'`) and `X-H4B-Retention` (`server` | `tab` | minutes). The server enforces retention and should tie the id to the user's session.
- Both provide the `retention` service (`current`, `choices`, `location`, `encrypted`, `keyTtlMinutes`, `set`, `subscribe`); the widget shows it behind 🔒 (`showPrivacy: false` hides it). `ask()` resolves at the end of the turn, possibly before the async save finishes; use `waitForIdle` in tests that reload.
- `tabSync({ mode: 'sync', channel })`: `sync` broadcasts snapshots (same thread → merge by message id ordered by `createdAt`; different thread → replace; snapshots arriving during a turn are applied after it). `notify` keeps histories apart and emits `tabs.activity` (actions, assistant turns, resets) plus a `tab-sync.activity` context signal with the last 10 (`context: false` disables it). `off` broadcasts nothing. With `notify`/`off`, use the `'tab'` retention so tabs don't overwrite each other's saved conversation.

## Testing

```ts
import { scriptedTransport, reply, waitForIdle } from '@handsforbots/testkit'
```

Or an inline `Transport` with `async *run(request) { yield ... }`. Await `h4b.ask(...)`; never use fixed sleeps (repo convention: wait for conditions).
