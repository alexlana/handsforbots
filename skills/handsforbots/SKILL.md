---
name: handsforbots
description: Integrate Hands for Bots v2 (H4B, @handsforbots/* packages) into a web app - create the kernel with createH4B, pick a transport (AG-UI, Rasa, HTTP/UniversalLLM, OpenAI-compatible, Vercel AI SDK, CopilotKit), declare GUI actions the assistant, the user and browser agents can trigger, send context signals, add the <h4b-chat> widget or React/Vue bindings, voice, menu, guided tours, storage and tab sync, and write plugins. Use whenever code imports @handsforbots/*, calls createH4B, h4b.actions.register, h4b.signal/ask/runAction/push, or the user mentions Hands for Bots, H4B or HfB. For the conversation history (h4b.messages, recording GUI decisions, timelines), also load handsforbots-history. For consent tools, cookie banners, LGPD/GDPR or anonymization, also load handsforbots-consent.
---

# Hands for Bots v2 — integration

H4B v2 is a headless TypeScript kernel plus plugins. It is **not a chat window**: it sits between people, the host GUI and any agent. Inputs become **signals**, signals become **turns**, backends answer with **stimuli** (messages, action calls, UI effects, state). GUI capabilities are declared once as **actions** and become available to the assistant (tool calls), to the user (direct commands, no LLM round trip) and to browser agents (WebMCP), under the same validation, confirmation and origin rules.

Source of truth: the repository docs, `docs/en-us/*.md` (`docs/pt-br` in Portuguese), at https://github.com/alexlana/handsforbots. `docs/en-us/plugins.md` lists every package and option. v1 (`handsforbots/Bot.js`, `[•{...}•]` tags, `bot.eventEmitter`) is gone and nothing is compatible: if the project still uses v1, see `docs/en-us/migrating-from-v1.md` before touching it.

## Before writing code

1. Check how the project gets the packages. They are not on npm yet: inside the H4B monorepo they resolve through the pnpm workspace; elsewhere they come from a build (`pnpm build` → `dist/`) or a local link. Don't invent install commands.
2. Find the transport. It decides what the model receives (history, context, tools) — see the table in `references/runtime.md`.
3. List the GUI capabilities the assistant should drive. They become actions; most of the integration is designing them well.

## Minimal setup

```ts
import { createH4B } from '@handsforbots/core'
import { universalLLM } from '@handsforbots/transport-http'
import { widget } from '@handsforbots/widget'
import { storageLocal } from '@handsforbots/storage-local'
import { tabSync } from '@handsforbots/tab-sync'
import { z } from 'zod'

const h4b = createH4B({
  plugins: [
    universalLLM({ url: '/api/llm', provider: 'anthropic' }), // keys stay on the server
    widget({ botName: 'Assistant', language: 'en-us' }),
    storageLocal(), // encrypted; the key cookie expires after 30 min idle. Or storageBackend({ url })
    tabSync(), // mode: 'sync' | 'notify' | 'off'
  ],
  actions: [
    {
      name: 'filter_orders',
      description: 'Filters the orders table by status',
      input: z.object({ status: z.enum(['open', 'late', 'closed']) }),
      handler: ({ status }) => ordersTable.filter(status),
    },
  ],
})
await h4b.start() // mounts plugins in dependency order, then restores storage
```

Exactly one plugin may provide each service (`transport`, `storage`, `confirm`, …); providing it twice throws. A turn without a `transport` fails with "No transport configured" (direct commands still work).

## Designing actions (the core of an integration)

- Name: `[a-zA-Z0-9_.-]`, max 64, unique. Description written for the model: what it does on screen, when to use it.
- Validate with `input` (Zod/Valibot/ArkType, JSON Schema derived automatically) or give `parameters` (JSON Schema). Arguments are validated before the handler; invalid calls return an error to the caller.
- Return small, JSON-serializable results. They are stored in the history, persisted, and sent back to the model. Never return DOM nodes, class instances or secrets.
- `destructive: true` (or `confirm: 'always'`) needs a `confirm` service — **without one the call is refused**: `h4b.provide('confirm', async ({ description, origin }) => window.confirm(...))`.
- `exposeTo: ['user']` / `['assistant', 'user']` / include `'agent'` only for actions safe for browser agents (WebMCP publishes only those). `readOnly: true` for actions that change nothing.
- `handler(args, call)`: `call.origin`, `call.signal` (abort on barge-in), `call.render(component, props)` for rich content in the reply.
- In React or Vue register with `useAction(definition)` so it lives while the component is mounted.

## Telling the assistant what is on screen

Context signals travel with every turn until replaced (same `key`) or removed; they are not history:

```ts
h4b.signal({ kind: 'context', key: 'orders.view', modality: 'gui-event', source: 'app',
  parts: [{ type: 'data', name: 'view', value: { filter: 'late', selected: '1042' } }] })
h4b.removeContext('orders.view')
```

React/Vue: `useContextSignal(key, value)`. Declarative HTML (`data-h4b-context`, `data-h4b-say`, `data-h4b-command`), route and selection tracking come from `gui()` in `@handsforbots/inputs`.

## Host API cheat sheet

| Need | Call |
|---|---|
| Ask and wait for the answer | `const { status, messages } = await h4b.ask('…')` |
| Fire and forget input | `h4b.send(text)` / `h4b.signal({...})` |
| Run an action as the user, recorded in history | `await h4b.runAction(name, args)` (never throws; returns `{ result }` or `{ error }`) |
| Deliver stimuli outside a turn (server push, "report ready") | `await h4b.push([...])` |
| Cancel the running turn / clear the queue | `h4b.abort()` / `h4b.abort({ clearQueue: true })` |
| New conversation, clear storage | `await h4b.reset()` |
| Observe | `h4b.on(event, fn)`, `await h4b.when(event, predicate, { timeout })` |
| Transform or veto | `h4b.intercept('signal.before' | 'request.before' | 'action.before' | 'stimulus.before', fn)` |
| Bind a UI | `h4b.subscribe(fn)` + `h4b.getSnapshot()`, or `@handsforbots/react` hooks / `@handsforbots/vue` composables |

Everything goes through **one queue**: turns, `runAction` and `push` run one at a time, in order. A `runAction` issued during a long LLM turn waits for it. Details and pitfalls: `references/runtime.md`.

## Writing a plugin

`definePlugin({ name, inject?, provides?, config?, apply(ctx, config) })`. Register everything through `ctx` (`registerAction`, `on`, `intercept`, `provide`, `addMatcher`, `capture`, `effect`, `onDispose`) so it is undone on dispose. Don't import other plugins at runtime: `ctx.get('voice')` and react to `service.provided` / `service.removed`. Extend `Services`, `Events` and `Hooks` with declaration merging for types. Full guide: `docs/en-us/writing-plugins.md`.

## Checklist before finishing

- [ ] No API keys in the browser (`openAICompatible` with `apiKey` only for localhost development).
- [ ] Every action has a model-oriented description, a schema, a small JSON result and the narrowest `exposeTo` that works; destructive ones have a `confirm` service.
- [ ] Screen state the model needs goes as context signals, not as fake user messages.
- [ ] `await h4b.start()` before relying on restored history; `h4b.stop()` on teardown (SPAs, tests).
- [ ] Memory, storage, retention and tabs chosen on purpose (skill `handsforbots-persistence`).
- [ ] If the site has a consent tool: `createH4B({ consent })` wired to it (skill `handsforbots-consent`).
- [ ] Tested with a scripted transport (`@handsforbots/testkit` or an inline `Transport`) and, in the browser, with a reload mid-conversation if `storage-local` is used.
