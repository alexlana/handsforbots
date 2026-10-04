# Plugins

Every package exports a plugin factory: call it with options and pass it to `createH4B({ plugins })`. Optional services (voice, menu, files, camera…) are discovered at runtime: the widget, for instance, shows a microphone only when `voice` is installed.

| Package | Plugin(s) | Provides |
|---------|-----------|----------|
| [`core`](#core) | — | kernel |
| [`transport-agui`](#transport-agui) | `agui` | `transport` |
| [`transport-rasa`](#transport-rasa) | `rasa` | `transport` |
| [`transport-http`](#transport-http) | `http`, `universalLLM`, `openAICompatible` | `transport` |
| [`transport-ai-sdk`](#transport-ai-sdk) | `aiSdk` | `transport` |
| [`widget`](#widget) | `widget` | — |
| [`react`](#react) | hooks | — |
| [`copilotkit`](#copilotkit) | `useCopilotKitBridge`, `<CopilotKitBridge>` | `transport` (optional) |
| [`assistant-ui`](#assistant-ui) | `useH4BAssistantRuntime` | — |
| [`menu`](#menu) | `menu` | `menu` |
| [`voice`](#voice) | `voice` | `voice` |
| [`keyboard`](#keyboard) | `keyboard` | — |
| [`inputs`](#inputs) | `camera`, `files`, `gui`, `sensors` | `camera`, `files`, `sensors` |
| [`guided`](#guided) | `guided` | `guided` |
| [`expose-webmcp`](#expose-webmcp) | `webmcp` | `webmcp` |
| [`mcp-apps`](#mcp-apps) | `mountMcpApp`, `mcpAppRenderer` | — |
| [`storage-local`](#storage-local) | `storageLocal` | `storage` |
| [`tab-sync`](#tab-sync) | `tabSync` | — |
| [`observability`](#observability) | `observability` | `observability` |
| [`testkit`](#testkit) | test helpers, `transportConformance` | — |

## core

```ts
const h4b = createH4B({
  plugins: [...],
  actions: [...],            // registered right away
  threadId?: string,
  matchThreshold?: 0.75,     // minimum confidence for direct commands
  maxActionRoundtrips?: 5,   // assistant ↔ client action loops per turn
  onError?: (error, source) => void,
})
await h4b.start()
```

Main API: `signal()`, `send()`, `ask()`, `runAction()`, `push()`, `abort()`, `reset()`, `actions.register()`, `provide()/get()`, `on()/when()`, `intercept()`, `addMatcher()`, `capture()`, `subscribe()/getSnapshot()`, `use(plugin)`, `stop()`.

## transport-agui

`agui({ url, headers?, agent?, forwardedProps? })`: HTTP POST + SSE. `headers` may be a function (refresh tokens, trace headers). `agent` accepts any AG-UI agent (e.g. `new HttpAgent()` from `@ag-ui/client`, or an in-process one). CUSTOM events named `h4b.ui.effect` and `h4b.ui.render` become GUI effects and rich content.

## transport-rasa

`rasa({ url, headers?, sender?, metadata?, reportActionResults? })`: REST channel. The H4B thread id is the Rasa sender; context signals go as `metadata.h4b_context`. Text, images and buttons become bubbles and quick replies (clicking sends the button payload). Rasa can drive the GUI with `custom`:

```yaml
responses:
  utter_show_save:
  - text: Here it is!
    custom:
      h4b:
        action: { name: guided_highlight, args: { target: '#save_button', text: 'Save here' } }
        # effect: { name: scroll, value: '#top' }
        # render: { component: gallery, props: { images: [...] } }
```

## transport-http

- `http({ url, method?, headers?, session?, body?, parse?, parseChunk?, sendToolResults? })`: generic turn API. `session: { url, method, extract }` opens one backend session per thread (falls back to the thread id). Responses: plain text, `{ response | content | text | message }`, arrays of messages (`text`, `image`, `buttons`), chat completions, `tool_calls`; `text/event-stream` is streamed (OpenAI-style deltas, fragmented tool calls).
- `universalLLM({ url, provider?, model?, systemPrompt?, contextWindow?, parameters?, stream?, backendSession? })`: the v1 UniversalLLM request format, plus history, tools and context.
- `openAICompatible({ baseUrl, model, systemPrompt?, apiKey?, stream?, temperature? })`: `/chat/completions` with native tools. A key in the browser is public: use it for local development (e.g. Ollama at `http://localhost:11434/v1`) or point `baseUrl` at your proxy.

## transport-ai-sdk

`aiSdk({ url, headers?, body?, fetch? })`: talks to a Vercel AI SDK route that returns `streamText(...).toUIMessageStreamResponse()`. The request mirrors `DefaultChatTransport` (`id`, `messages` as UIMessages, `trigger`) plus `tools` (H4B actions) and `context`; declare the tools without `execute` on the route so the client runs them:

```ts
export async function POST(req: Request) {
  const { messages, tools, context } = await req.json()
  return streamText({
    model,
    system: `Screen: ${JSON.stringify(context)}`,
    messages: await convertToModelMessages(messages),
    tools: Object.fromEntries(tools.map((t) => [t.name, tool({ description: t.description, inputSchema: jsonSchema(t.parameters) })])),
  }).toUIMessageStreamResponse()
}
```

Data parts `data-ui-effect`, `data-ui-render` and `data-state` become GUI effects, rich content and shared state.

## widget

`widget({ container?, layout?: 'floating' | 'sidebar' | 'inline', corner?, startOpen?, alwaysOpen?, title?, botName?, botJob?, avatar?, language?, strings?, theme?: 'auto' | 'light' | 'dark', color?: 'blue' | 'purple' | 'orange' | 'green', colors?, greeting?, disclaimer?, pace?, showActions?, autofocus?, renderers? })`

A Web Component (`<h4b-chat>`, shadow DOM) usable in any page or framework: safe Markdown, images, quick replies, action cards labelled by origin, a status line shared by all routes, paced bot messages, menu suggestions while typing, microphone and speaker controls (with `voice`), attach and camera buttons (with `files` / `camera`), paste and drop. Style it with CSS variables (`--h4b-primary`, `--h4b-bg`, `--h4b-radius`…) or `::part()`. Add components for rich content with `renderers: { name: (props) => HTMLElement }`; `gallery` is built in.

## react

`<H4BProvider value={h4b}>`, `useH4B()`, `useH4BState(selector)`, `useMessages()`, `useTurn()`, `useBusy()`, `useSharedState()`, `useAction(definition)` (registered while mounted, always calls the latest handler), `useContextSignal(key, value)`, `useH4BEvent(name, listener)`, `useStimulus(listener)`, `useStore(service)` (for stateful services like `voice`).

## vue

`app.use(h4bVue(h4b))` (or `provideH4B(h4b)` in a component), `useH4B()`, `useH4BState(selector)`, `useMessages()`, `useTurn()`, `useBusy()`, `useSharedState()`, `useAction(definition)`, `useContextSignal(key, refOrGetter)`, `useH4BEvent(name, listener)`, `useStimulus(listener)`, `useService(key)` (follows the service being provided or removed later), `useStore(refOrGetter)`. State comes back as read-only shallow refs that trigger only when the selected value changes; registrations end with the component (or `effectScope`).

```ts
const voiceState = useStore(useService('voice'))   // listening, speaking, partial…
const messages = useMessages()
```

## copilotkit

Inside both `<CopilotKitProvider>` and `<H4BProvider>`: `useCopilotKitBridge({ agentId?, transport?, contextDescription? })`. H4B actions become CopilotKit frontend tools, context signals become agent context, and (unless `transport: false`) the CopilotKit agent is H4B's transport, so voice, menu fallbacks and sensors reach it and its answers can be spoken. Direct commands are mirrored into the agent history.

## assistant-ui

`useH4BAssistantRuntime()` returns an assistant-ui runtime backed by H4B: `<AssistantRuntimeProvider runtime={useH4BAssistantRuntime()}><Thread /></AssistantRuntimeProvider>`. assistant-ui renders the thread and composer; tool calls show with their results, rich content arrives as `data-h4b-ui` parts, cancel aborts the H4B turn. Any transport works behind it.

## menu

`menu({ commands, language?, fuzzyThreshold?: 0.8, maxFuzzyWords?: 6 })`. A command: `{ action, label?, slash?, patterns?, phrases?, args?, reply? }`.

- `slash: 'late'` → `/late …` (the rest of the line is `rest`).
- `patterns: ['show {status} orders', /^orders? (?<status>\w+)$/]`: case- and accent-insensitive templates, or RegExps with named groups.
- `phrases: { en: ['late orders'], pt: ['pedidos atrasados'] }`: typo-tolerant matching for short inputs (great with speech).
- Service: `suggest(text)`, `list()`, `add(command)`, `commandSignal(action, args, label)` for buttons and palettes.

## voice

`voice({ stt, tts?, language?, mode?: 'push-to-talk' | 'hands-free', output?: 'auto' | 'voice' | 'text', bargeIn?: true, bargeInChars?: 4, voiceName? })`. `stt`/`tts` take a provider or a list (tried in order, falling back on network/support errors).

| Provider | Notes |
|----------|-------|
| `webSpeechSTT()`, `webSpeechTTS({ voice?, rate?, pitch? })` | Browser APIs; long texts are split into sentences |
| `httpSTT({ url, headers?, parse?, silenceMs? })`, `httpTTS({ url })` | Your backend proxies any cloud provider (keys stay server-side); simple voice activity detection for hands-free |
| `websocketSTT({ url, sampleRate?, onOpen?, parse, finish? })` | Streams 16-bit PCM; `url` can be a function that fetches a short-lived token |
| `voskSTT({ url })` | Self-hosted Vosk server |
| `voskBrowserSTT({ modelUrl, load: () => import('vosk-browser'), grammar? })` | Offline, in the browser (WebAssembly); the model downloads once, then no audio leaves the device. `preload()` warms it up |

Service: `listen({ until? })`, `stop()`, `cancel()`, `toggle()`, `setMode()`, `setOutput()`, `speak()`, `cancelSpeech()`, `getState()` (`listening`, `speaking`, `partial`, `lastInput`, `error`…), `subscribe()`.

- `stop()` ends listening and still sends what was said; `cancel()` ends it and discards the utterance (nothing is sent, including a final transcript the provider delivers late).
- Push-to-talk ends on the first pause by default (good for click-to-talk). `listen({ until: 'stop' })` is hold-to-talk: recognition keeps going across pauses (restarting if the browser ends its session), `partial` shows everything said so far, and one message goes out on `stop()`. The widget's mic button and the keyboard `talk` shortcut use it.

## keyboard

`keyboard({ talk?: 'Alt+KeyM', interrupt?: 'Escape', palette?: 'Mod+KeyK', target? })`. Hold `talk` to talk, sent on release (toggles in hands-free), `interrupt` stops speech and cancels the running turn, `palette` emits `keyboard.palette` for your command palette. `false` disables a shortcut.

## inputs

- `camera({ facingMode?, maxSide?: 1280, mimeType?, quality? })`: service `open(video?)`, `capture(prompt?)` (sends a photo), `frame()`, `startFrames(intervalMs)` (latest frame as context `camera.frame`), `stopFrames()`, `close()`.
- `files({ accept?, maxSizeMB?: 10, maxFiles?: 5 })`: service `pick(prompt?)`, `attach(files, prompt?)`.
- `gui({ route?, selection?, declarative?, idle? })`: route and selection as context; `data-h4b-say`, `data-h4b-command` + `data-h4b-args`, `data-h4b-context` + `data-h4b-value` attributes; `idle: { minutes, text }` re-engages once after inactivity.
- `sensors({ enable?, throttleMs? })`: `geolocation`, `orientation`, `network` as context signals, opt-in through `enable` or the service.

## guided

`guided({ tours?, autoStart?, language?, narrate?, vocabulary?, sectionsAttribute?, gallery? })`. Actions: `guided_tour` (`{ name }` or `{ steps }`), `guided_highlight` (`{ target, text?, title? }`), `guided_close`, plus `show_section` (when `sectionsAttribute` is set) and `image_gallery` (when `gallery: true`). A step: `{ title?, text, target?, next?, previous?, close? }`; targets are found inside open shadow roots (e.g. `#chat_input` in the widget). While a tour is open, "next", "back", "skip" (and Portuguese equivalents), typed or spoken, navigate it; other questions still reach the assistant.

## expose-webmcp

`webmcp({ include?: 'explicit' | 'all', prefix?, modelContext? })`. Publishes actions to browser agents through `document.modelContext` (Chrome origin trial). By default only actions with `exposeTo` including `'agent'`. Calls go through the kernel: validation, interceptors, confirmation, and a visible trace in history (route `agent`).

## mcp-apps

Renders [MCP Apps](https://modelcontextprotocol.io) (`ui://` resources, `text/html;profile=mcp-app`) that your backend, acting as MCP client, sends as `ui.render` with component `mcp-app` and props `{ html, toolName?, input?, result?, csp? }`. The app runs in a sandboxed iframe (`allow-scripts`, opaque origin) with a restrictive CSP; H4B is its host: `ui/initialize`, tool input/result after `initialized`, `tools/call` mapped to H4B actions in `allowTools` (origin `agent`, recorded in history), `ui/message` as user input, `ui/open-link` (http/https only), `ui/update-model-context` as a context signal, `size-changed`.

```ts
widget({ renderers: { 'mcp-app': mcpAppRenderer({ allowTools: ['filter_orders'] }) } })
// or in your own UI: element.append(mountMcpApp(h4b, props, { allowTools }))
```

## storage-local

`storageLocal({ key?, ttlMinutes?: 30, area?: 'local' | 'session', maxMessages?: 200 })`. Restores the conversation on load; starts fresh after inactivity. Blobs are replaced by placeholders.

## tab-sync

`tabSync({ channel?, throttleMs? })`. Mirrors the conversation across tabs; histories of the same thread are merged by message id.

## testkit

For plugin and transport authors: `scriptedTransport`, `reply`, `eventually`, `waitForIdle` and `transportConformance(name, { create(scenario) })`, a Vitest suite (text answer, client action round trip, backend error, abort) that every transport in this repository passes.

## observability

`observability({ includeContent?: false, ...createObservabilityOptions })`. Turns, per-route phases, actions, signals and stimuli as semantic events, plus perceived latency per route (`h4b_first_response_ms`, `h4b_turn_duration_ms`) to tune direct commands against LLM answers, for Grafana (Faro/OTel), Langfuse and LangSmith. See [`packages/semantic-event-observability`](../../packages/semantic-event-observability/README.md) and [`examples/OBSERVABILITY.md`](../../examples/OBSERVABILITY.md).
