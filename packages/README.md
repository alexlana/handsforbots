# Hands for Bots v2 packages

| Package | What it does |
|---------|--------------|
| [`@handsforbots/core`](./core) | Headless kernel: plugins, signals → turns → stimuli, router (direct / capture / transport / agent / push), actions with confirmation and origin policies, interceptors, shared state, storage |
| [`@handsforbots/transport-agui`](./transport-agui) | AG-UI transport (HTTP + SSE, or any AG-UI agent) |
| [`@handsforbots/transport-rasa`](./transport-rasa) | Rasa REST channel; `custom.h4b` drives GUI actions |
| [`@handsforbots/transport-http`](./transport-http) | Generic HTTP turns (sessions, SSE, tool calls) + `universalLLM` and `openAICompatible` presets |
| [`@handsforbots/transport-ai-sdk`](./transport-ai-sdk) | Vercel AI SDK UI message stream (tested against real `streamText`) |
| [`@handsforbots/widget`](./widget) | `<h4b-chat>` Web Component: layouts, themes, rich content, voice/attach/camera controls |
| [`@handsforbots/react`](./react) | React bindings: provider, store hooks, `useAction`, `useContextSignal`, `useStore` |
| [`@handsforbots/vue`](./vue) | Vue composables: `h4bVue` plugin, store refs, `useAction`, `useContextSignal`, `useService`, `useStore` |
| [`@handsforbots/copilotkit`](./copilotkit) | CopilotKit bridge: actions as frontend tools, context, input through the CopilotKit agent |
| [`@handsforbots/assistant-ui`](./assistant-ui) | assistant-ui runtime backed by H4B |
| [`@handsforbots/menu`](./menu) | Direct commands without the LLM: slash, patterns, fuzzy phrases, suggestions |
| [`@handsforbots/voice`](./voice) | Speech in and out with pluggable providers (browser, HTTP, WebSocket, Vosk), push-to-talk, hands-free, barge-in |
| [`@handsforbots/keyboard`](./keyboard) | Shortcuts: hold-to-talk, interrupt, command palette |
| [`@handsforbots/inputs`](./inputs) | Camera (photos, video frames), files, GUI events (Poke successor), sensors |
| [`@handsforbots/guided`](./guided) | Guided tours, highlights, `show_section`, `image_gallery` |
| [`@handsforbots/expose-webmcp`](./expose-webmcp) | Publishes actions to browser agents through WebMCP |
| [`@handsforbots/mcp-apps`](./mcp-apps) | Hosts MCP Apps (`ui://`) in sandboxed iframes, bridging their tool calls to actions |
| [`@handsforbots/memory`](./memory) | Memory policy: turns sent and kept, compaction (mounted by default) |
| [`@handsforbots/storage-local`](./storage-local) | Conversation persistence in the browser, encrypted with a key that expires |
| [`@handsforbots/storage-backend`](./storage-backend) | Conversation persistence on your server |
| [`@handsforbots/tab-sync`](./tab-sync) | Tabs share the conversation, hear about each other's actions, or stay isolated |
| [`@handsforbots/observability`](./observability) | Turns, routes, actions and signals as semantic telemetry |
| [`@handsforbots/testkit`](./testkit) | Test helpers and the transport conformance suite |
| [`@handsforbots/semantic-event-observability`](./semantic-event-observability) | The underlying observability library (Grafana, OTel, Langfuse, LangSmith) |

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

Docs: [docs/en-us](../docs/en-us/getting-started.md) · [docs/pt-br](../docs/pt-br/getting-started.md). Architecture and plan: [ROADMAP.md](../ROADMAP.md). Examples: [react-agui](../examples/react-agui), [vite (Rasa)](../examples/README.md).
