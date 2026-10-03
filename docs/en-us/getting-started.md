# Getting started

Hands for Bots (H4B) is a headless runtime: you create an instance, add plugins, and decide which UI to use (the `<h4b-chat>` widget, your own components, or CopilotKit). Everything is a plugin, including the backend connection.

> The packages are not on npm yet. Inside this repository they resolve through the pnpm workspace (`pnpm install`). See [Development](./development.md).

## 1. The smallest setup: widget + any backend

```ts
import { createH4B } from '@handsforbots/core'
import { rasa } from '@handsforbots/transport-rasa'
import { widget } from '@handsforbots/widget'

const h4b = createH4B({
  plugins: [
    rasa({ url: 'http://localhost:5005/webhooks/rest/webhook' }),
    widget({ botName: 'Assistant', language: 'en', startOpen: true }),
  ],
})
await h4b.start()
```

Swap the transport without touching the rest:

| Backend | Plugin |
|---------|--------|
| Any AG-UI server (CopilotKit runtime, LangGraph, Mastra, PydanticAI…) | `agui({ url })` from `@handsforbots/transport-agui` |
| Rasa (REST channel) | `rasa({ url })` from `@handsforbots/transport-rasa` |
| Your own HTTP API (sessions, SSE, tool calls) | `http({ url, session, body, parse })` from `@handsforbots/transport-http` |
| v1 UniversalLLM backend (PHP/Laravel proxy) | `universalLLM({ url, provider, model })` |
| OpenAI-compatible APIs (OpenAI, Ollama, vLLM, LiteLLM…) | `openAICompatible({ baseUrl, model })`, development only if the key is in the browser |
| CopilotKit owns the agent | `useCopilotKitBridge()` from `@handsforbots/copilotkit` |

## 2. Let the assistant act on your GUI

Actions are the heart of H4B. Declare what your interface can do; the assistant (tool calls), the user (direct commands) and browser agents (WebMCP) can then trigger it, under the same rules.

```ts
h4b.actions.register({
  name: 'filter_orders',
  description: 'Filters the order list by status',
  parameters: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'late', 'closed'] } }, required: ['status'] },
  handler: ({ status }) => ordersTable.filter(status),
  exposeTo: ['assistant', 'user', 'agent'],
})

h4b.actions.register({
  name: 'cancel_order',
  description: 'Cancels an order',
  input: z.object({ id: z.string() }), // any Standard Schema (Zod, Valibot, ArkType) also produces the JSON Schema
  destructive: true, // asks the user first, whoever requested it
  handler: ({ id }) => api.cancel(id),
})

h4b.provide('confirm', async ({ description, origin }) => window.confirm(`${description}? (requested by ${origin})`))
```

Tell the assistant what is on screen with context signals; they go with every turn:

```ts
h4b.signal({ kind: 'context', key: 'orders.view', modality: 'gui-event', source: 'app',
  parts: [{ type: 'data', name: 'view', value: { filter: 'late', selected: '1042' } }] })
```

## 3. Keyboard and voice

```ts
import { voice, webSpeechSTT, webSpeechTTS, httpSTT } from '@handsforbots/voice'
import { keyboard } from '@handsforbots/keyboard'

createH4B({
  plugins: [
    voice({
      stt: [httpSTT({ url: '/api/stt' }), webSpeechSTT()], // cloud first, browser as fallback
      tts: webSpeechTTS(),
      language: 'en-US',
      mode: 'push-to-talk', // or 'hands-free'
    }),
    keyboard(), // hold Alt+M to talk, Esc to interrupt, Mod+K palette request
  ],
})
```

Spoken questions get spoken answers; typed ones stay silent (configurable). See [Plugins → voice](./plugins.md#voice).

## 4. Direct commands (no LLM)

```ts
import { menu } from '@handsforbots/menu'

menu({
  language: 'en',
  commands: [
    { action: 'filter_orders', label: 'Late orders', slash: 'late', phrases: ['late orders'], args: { status: 'late' } },
    { action: 'filter_orders', patterns: ['show {status} orders'], args: ({ status }) => ({ status }) },
  ],
})
```

"show late orders", `/late` or a button run the action instantly and are recorded in history, so the LLM knows about them on the next turn.

## 5. React

```tsx
import { H4BProvider, useAction, useContextSignal, useMessages } from '@handsforbots/react'

root.render(<H4BProvider value={h4b}><App /></H4BProvider>)

function Orders() {
  const [status, setStatus] = useState('all')
  useAction({ name: 'filter_orders', description: '…', parameters, handler: ({ status }) => setStatus(status) })
  useContextSignal('orders.view', { status })
  // …
}
```

## Next

- [Concepts](./concepts.md): signals, turns, stimuli, routes, sync/async.
- [Plugins](./plugins.md): every package and its options.
- [Writing plugins](./writing-plugins.md).
- [Security](./security.md).
- Examples: [`examples/react-agui`](../../examples/react-agui/README.md) (React + AG-UI + voice + WebMCP) and [`examples/vite`](../../examples/README.md) (Rasa + widget + guided tours).
