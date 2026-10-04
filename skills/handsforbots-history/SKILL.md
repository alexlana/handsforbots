---
name: handsforbots-history
description: Read and extend the Hands for Bots v2 conversation history (h4b.messages) - record user decisions made in the GUI with h4b.runAction so they show up in the history, reach the model and survive reloads, choose between runAction, context signals and push, and build a navigable timeline of decisions with the bundled timeline.ts helper. Use when code reads h4b.messages / useMessages, when building a history, timeline, audit or "go back to a decision" view on top of H4B, or when GUI events that don't go through the AI should be part of the conversation.
---

# Hands for Bots v2 — history

The history is `h4b.messages`: `user`, `assistant` and `tool` messages, each with `id`, `createdAt` and the `route` that produced it. Every action that runs inside the kernel is recorded there — whether the assistant, the user or a browser agent called it. Extend this history instead of building a parallel store: it is what the backend receives, what the widget draws, what `storage-local` saves and what `tab-sync` merges.

Full guide: `docs/en-us/history.md` (`docs/pt-br/history.md`) in https://github.com/alexlana/handsforbots.

## Choose the mechanism first

| The event is… | Use | History | Model | Widget |
|---|---|---|---|---|
| A user decision worth finding again (filter, selection, approval, navigation step) | `h4b.runAction(name, args)` | tool call + result, route `direct` | yes, next turn | `⚡ direct action <name>` |
| Current screen state the assistant needs | context signal (`kind: 'context'`, stable `key`) | no | every turn | no |
| An assistant-side message outside a turn ("export finished") | `h4b.push([...])` | assistant message, route `push` | yes | bubble |
| A question asked for the user | `h4b.ask(...)` | user message + answer | yes | bubble |

"Model: yes" only for transports that send the history (AG-UI, HTTP, UniversalLLM, OpenAI-compatible, AI SDK, CopilotKit). With `rasa`, only the turn text and `metadata.h4b_context` reach Rasa; record decisions anyway for the timeline, and send what Rasa must know as context or as a message.

Never `h4b.conversation.append(...)` from host code: it skips the queue (can land in the middle of a streaming answer), emits no `turn.status`, and is only persisted when the next job ends.

## Recording decisions

Best: the GUI control itself goes through the action, so the user, the assistant and agents share one capability.

```ts
h4b.actions.register({
  name: 'filter_orders',
  description: 'Filters the orders table by status',
  input: z.object({ status: z.enum(['open', 'late', 'closed']) }),
  handler: ({ status }) => { ordersTable.filter(status); return { status } },
})
select.addEventListener('change', (e) => void h4b.runAction('filter_orders', { status: e.target.value }))
```

When the GUI already changed (third-party widget, router, optimistic UI) and you only need a record, register a record-only action the assistant can't call:

```ts
h4b.actions.register({
  name: 'record_decision',
  description: 'A decision the user made in the interface',
  exposeTo: ['user'],
  handler: (decision) => decision,
})
void h4b.runAction('record_decision', { kind: 'plan', value: 'pro', label: 'Chose the Pro plan' })
```

Rules that matter:

- **Queued.** `runAction` waits for a running LLM turn. Apply the visible change yourself if it must be instant; the record follows when the queue frees.
- **Never throws, always records.** Unknown action, not exposed to `user`, invalid args, declined confirmation, `action.before` veto: all become a `tool` message with `error`, shown in the widget and sent to the model. Check `const { error } = await h4b.runAction(...)`; make sure the action exists before recording.
- **Args and results are history.** They are persisted (plain JSON in `localStorage` with `storage-local`) and sent to the backend. Keep them small, JSON-only, free of secrets; give them a human `label` if the timeline should show text. Redact with a `request.before` interceptor when needed.
- **`exposeTo: ['user']` hides the action from the assistant's tools, not its recorded calls.** OpenAI-style transports send past calls as `tool_calls`; verify the backend accepts calls to tools absent from `tools`.
- **Each `runAction` adds two messages** (call + result). `storageLocal` keeps the last `maxMessages` (default 200) and starts a new conversation after `ttlMinutes` (default 30) idle. Size these for the timeline, or mirror decisions to your backend if they must outlive the conversation.
- `<button data-h4b-command="name" data-h4b-args='{"…":…}'>` with `gui()` from `@handsforbots/inputs` records without code.

## Building the timeline

Copy `scripts/timeline.ts` into the host project. It pairs each tool call (args, in the assistant message) with its result (in the `tool` message):

```ts
import { timeline, watchTimeline } from './timeline'

const decisions = timeline(h4b.messages, { kinds: ['action'], routes: ['direct'] })
// [{ kind: 'action', id, at, route, name, args, result, error, settled }]

const stop = watchTimeline(h4b, render, { kinds: ['action'] }) // re-renders on messages.changed
```

Include `'transport'` and `'agent'` routes to show what the assistant and agents did too; include `kinds: ['user', 'assistant']` for a full conversation view. `messages.changed` fires on every streamed delta: memoize or throttle heavy renders. In React, derive it from `useMessages()` with `useMemo`.

## Navigating back

The history is append-only (no edit/delete API; `reset()` wipes everything). To return to a decision, restore the GUI from that entry's `args` and record the return as a new decision — usually `h4b.runAction(entry.name, entry.args)` again — so the assistant sees the path the user took.

## Checklist

- [ ] Each GUI event is classified: decision (`runAction`), screen state (context signal), assistant notice (`push`), or not worth recording.
- [ ] Record-only actions use `exposeTo: ['user']`; real actions keep the narrowest `exposeTo` that works.
- [ ] Args/results are small JSON with no secrets; timeline labels come from them.
- [ ] Failures are handled from the returned outcome, not with try/catch.
- [ ] `maxMessages` / `ttlMinutes` fit how far back users navigate.
- [ ] Tested: record during a running turn, reload (with `storage-local`), second tab (with `tab-sync`), and the next model request contains the recorded calls.
