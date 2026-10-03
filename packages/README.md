# Hands for Bots v2 packages

| Package | What it does |
|---------|--------------|
| [`@handsforbots/core`](./core) | Headless kernel: plugins, signals → turns → stimuli, router (direct / capture / transport), action registry with confirmation and origin policies, interceptors, shared state, storage |
| [`@handsforbots/transport-agui`](./transport-agui) | AG-UI transport (HTTP + SSE, or any AG-UI agent) |
| [`@handsforbots/react`](./react) | React bindings: provider, store hooks, `useAction`, `useContextSignal`, `useStore` |
| [`@handsforbots/menu`](./menu) | Direct commands without the LLM: slash, patterns, fuzzy phrases, suggestions |
| [`@handsforbots/voice`](./voice) | Speech in and out with pluggable providers (browser, HTTP, WebSocket, Vosk), push-to-talk, hands-free, barge-in |
| [`@handsforbots/keyboard`](./keyboard) | Shortcuts: hold-to-talk, interrupt, command palette |
| [`@handsforbots/expose-webmcp`](./expose-webmcp) | Publishes actions to browser agents through WebMCP |
| [`@handsforbots/copilotkit`](./copilotkit) | CopilotKit bridge: actions as frontend tools, context, input through the CopilotKit agent |

```ts
import { createH4B } from '@handsforbots/core'
import { agui } from '@handsforbots/transport-agui'
import { menu } from '@handsforbots/menu'
import { voice, webSpeechSTT, webSpeechTTS } from '@handsforbots/voice'

const h4b = createH4B({
  plugins: [agui({ url: '/api/agent' }), menu({ commands }), voice({ stt: webSpeechSTT(), tts: webSpeechTTS() })],
  actions: [{ name: 'filter_orders', description: 'Filter orders', handler: ({ status }) => store.filter(status) }],
})
await h4b.start()
const { messages } = await h4b.ask('show late orders')
```

Development, from the repository root:

```bash
pnpm install
pnpm test          # all packages
pnpm typecheck
pnpm --filter @handsforbots/example-react-agui dev
```

Architecture and plan: [ROADMAP.md](../ROADMAP.md). Runnable example: [examples/react-agui](../examples/react-agui).
