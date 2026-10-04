# History

The H4B history is the conversation's message list: `h4b.messages`. It holds what the user said, what the assistant answered and **every action that ran**, whether it came from the assistant, the user (direct commands, buttons, `runAction`) or an external agent. It is the same history that goes to the backend on every turn, that the widget draws and that `storage-local` saves.

This guide shows how to read the history, how to record interface events that don't go through the AI, and how to build a timeline of decisions.

## Messages

| `role` | Added when | Useful fields |
|---|---|---|
| `user` | A trigger signal starts a turn | `parts`, `modality`, `source`, `signalId`, `route`, `createdAt` |
| `assistant` | The backend (or a direct command) answers | `parts`, `toolCalls`, `streaming`, `route`, `createdAt` |
| `tool` | An action finished | `toolCallId`, `name`, `result` or `error`, `route`, `createdAt` |

Every message has an `id` and a `createdAt`. The `route` says how the turn was resolved: `transport`, `direct`, `capture`, `agent` or `push` (see [Concepts](./concepts.md#routes)). An action's arguments are in the `toolCalls` of the `assistant` message; its result is in the `tool` message with the same `toolCallId`.

Messages are immutable: each change replaces the array and the changed objects, so you can compare by reference.

## Reading

```ts
h4b.messages                                           // current array
h4b.on('messages.changed', (messages) => draw(messages))
const off = h4b.subscribe(() => draw(h4b.getSnapshot().messages))
```

In React: `useMessages()` from `@handsforbots/react`.

`messages.changed` fires for every streamed chunk of text. If your history view is heavy, filter or batch the updates.

## Recording events from your interface

Pick the mechanism by what you need:

| You want to… | Use | In the history? | Does the model see it? | Does the widget show it? |
|---|---|---|---|---|
| Record a user decision (filter, selection, approval) | `h4b.runAction(name, args)` | Yes: tool call + result, route `direct` | Yes, from the next turn on | `⚡ direct action <name>` (`showActions: false` hides it) |
| Tell the assistant what is on screen right now | Context signal (`kind: 'context'`) | No | Yes, on every turn, until replaced or removed | No |
| Show an assistant message outside a turn | `h4b.push([...stimuli])` | Yes: `assistant` message, route `push` | Yes | Yes |
| Ask the assistant something on the user's behalf | `h4b.ask(...)` / `h4b.send(...)` | Yes: `user` message + answer | Yes | Yes (if there is text) |

"The model sees it" applies to transports that send the history: `agui`, `http`, `universalLLM`, `openAICompatible`, `aiSdk` and the CopilotKit bridge. `rasa` only sends the turn's text: the history lives in Rasa's tracker, and context signals go in `metadata.h4b_context`.

### User decisions with `runAction`

`runAction` runs a registered action through the same queue as turns and records the call and its result in the history. It is the right path for events you want to find again later and that the assistant should know about.

Ideally your interface already goes through the action: then the same `filter_orders` serves the user, the assistant and browser agents.

```ts
h4b.actions.register({
  name: 'filter_orders',
  description: 'Filters orders by status',
  input: z.object({ status: z.enum(['open', 'late', 'closed']) }),
  handler: ({ status }) => table.filter(status),
})

statusSelect.addEventListener('change', (e) => {
  void h4b.runAction('filter_orders', { status: e.target.value })
})
```

When the interface already changed on its own (a third-party component, a navigation) and you only want to **record** the decision, use a record-only action visible to the user only:

```ts
h4b.actions.register({
  name: 'record_decision',
  description: 'Decision the user made in the interface',
  exposeTo: ['user'],            // the assistant can't call it
  handler: (decision) => decision, // nothing to do: the result is the record
})

void h4b.runAction('record_decision', { kind: 'plan', value: 'pro', label: 'Chose the Pro plan' })
```

The declarative buttons of the `gui()` plugin from `@handsforbots/inputs` do the same without code: `<button data-h4b-command="filter_orders" data-h4b-args='{"status":"late"}'>`.

### Before you rely on it

- **`runAction` is queued.** If an LLM turn is running, the action only runs (and only appears in the history) when that turn ends. For an instant response on screen, update the interface in your own code and record with a record-only action. Pending actions don't show up in `getSnapshot().queued`, which lists signals only.
- **Failures are recorded too.** Unknown action, not exposed to the user, invalid arguments, declined confirmation or cancelled by an `action.before` interceptor: each becomes a `tool` message with `error`, shown by the widget and sent to the model. `runAction` never throws; check `outcome.error`.
- **`exposeTo: ['user']` removes the action from the assistant's tool list**, but calls already recorded still travel in the history. OpenAI-compatible transports send them as `tool_calls`; check that your backend accepts a tool call for a tool that is not in `tools`.
- **Don't call `h4b.conversation.append` directly.** It bypasses the queue (it can interleave with a streaming answer), doesn't emit `turn.status`, and storage only saves it at the end of the next turn.
- **No secrets.** Arguments and results go to the backend and, with `storage-local`, to `localStorage` without encryption. Use a `request.before` interceptor to redact personal data.

## Persistence, tabs and limits

- `storageLocal({ ttlMinutes: 30, maxMessages: 200 })` saves the history at the end of every turn, action or push, and restores it on `start()`. After `ttlMinutes` without activity, the conversation starts over. Only the last `maxMessages` messages are kept: each `runAction` takes **two** (the call and the result). If your timeline needs more, raise the limit or also store decisions in your backend.
- Blobs (photos, audio) become `omitted_media` placeholders when saved.
- `tabSync()` merges the tabs' histories by message `id`, in creation order; nothing is lost between tabs. A `reset()` in one tab replaces the conversation in the others.
- `h4b.reset()` starts a new conversation and clears the saved history.

## Decision timeline

To navigate between decisions, pair each tool call with its result:

```ts
import type { Message } from '@handsforbots/core'

function decisions(messages: Message[]) {
  const results = new Map(
    messages.flatMap((m) => (m.role === 'tool' ? [[m.toolCallId, m] as const] : [])),
  )
  return messages.flatMap((m) =>
    m.role === 'assistant' && m.route === 'direct'
      ? (m.toolCalls ?? []).map((call) => ({
          id: call.id,
          action: call.name,
          args: call.args,
          result: results.get(call.id)?.result,
          error: results.get(call.id)?.error,
          at: results.get(call.id)?.createdAt ?? m.createdAt,
        }))
      : [],
  )
}

h4b.on('messages.changed', (messages) => drawTimeline(decisions(messages)))
```

Replace `m.route === 'direct'` with `true` to also include the assistant's actions (`transport`) and agents' actions (`agent`).

The history only grows: there is no API to edit or delete a message. To "go back" to a decision, restore the interface state from that item's `args` and record the return as a new decision (for example, `runAction('filter_orders', args)` again).
