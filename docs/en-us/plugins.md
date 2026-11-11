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
| [`voice-models`](#voice-models) | `piperTTS`, `kokoroTTS`, `transformersTTS`, `workerTTS`, `espeakPhonemizer` (providers) | — |
| [`voice-effects`](#voice-effects) | `voiceEffects`, presets, `toSSML`, `toFFmpeg` | — |
| [`keyboard`](#keyboard) | `keyboard` | — |
| [`inputs`](#inputs) | `camera`, `files`, `gui`, `sensors` | `camera`, `files`, `sensors` |
| [`guided`](#guided) | `guided` | `guided` |
| [`expose-webmcp`](#expose-webmcp) | `webmcp` | `webmcp` |
| [`mcp-apps`](#mcp-apps) | `mountMcpApp`, `mcpAppRenderer` | — |
| [`cues`](#cues) | `cues` | `cues` |
| [`memory`](#memory) | `memory`, `httpSummarizer`, `localSummary`, `groupTurns` | `memory` |
| [`storage-local`](#storage-local) | `storageLocal`, `cookieKey`, `backendKey` | `storage`, `retention` |
| [`storage-backend`](#storage-backend) | `storageBackend` | `storage`, `retention` |
| [`tab-sync`](#tab-sync) | `tabSync` | — |
| [`consent`](#consent) | `redact`, presets, `loadConsentRules`, `regionFromMeta`, `regionFromUrl` | — |
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
  input?: { whileBusy?: 'interrupt' | 'queue' | 'merge' | { [modality]: … } | (signal) => … }, // what typed/spoken input does while busy (see Concepts)
  memory?: { … } | false,    // see memory
  consent?: { rules?, region?, initial?, manage?, channel? }, // see Consent
})
await h4b.start()
```

Main API: `signal()`, `send()`, `ask()`, `runAction()`, `push()`, `interrupt()`, `setInput()`, `abort()`, `reset()`, `persist()`, `actions.register()`, `provide()/get()`, `on()/when()`, `intercept()`, `addMatcher()`, `capture()`, `subscribe()/getSnapshot()`, `use(plugin)`, `stop()`, `consent` (`state()`, `granted()`, `set()`, `setRegion()`, `ready()`, `snapshot()`, `subscribe()`). `withConsent(plugin, purpose | false)` gates a plugin on a consent purpose, or never gates it. Guide: [Consent](./consent.md).

Sources and citations ([guide](./sources.md)): `sourceView`, `sourceGroups`, `sourcesOf`, `citedSources`, `citationSegments`, `validCitations`, `isCitation`, `safeSourceUrl`, `toSourcePart`, `inlineCitations` / `stripInlineCitations` (markers such as `[c3]` → citations, for backends and transports) and `utf8OffsetToIndex`.

## transport-agui

`agui({ url, headers?, agent?, forwardedProps? })`: HTTP POST + SSE. `headers` may be a function (refresh tokens, trace headers). `agent` accepts any AG-UI agent (e.g. `new HttpAgent()` from `@ag-ui/client`, or an in-process one). CUSTOM events named `h4b.ui.effect` and `h4b.ui.render` become GUI effects and rich content; `h4b.sources` (`{ messageId?, sources: [...] }`) and `h4b.citations` (`{ messageId?, citations }`) become [sources and citations](./sources.md). Sources are not sent back in the history.

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

- `http({ url, method?, headers?, session?, body?, parse?, parseChunk?, sendToolResults? })`: generic turn API. `session: { url, method, extract }` opens one backend session per thread (falls back to the thread id). Responses: plain text, `{ response | content | text | message }`, arrays of messages (`text`, `image`, `buttons`), chat completions, `tool_calls`; `text/event-stream` is streamed (OpenAI-style deltas, fragmented tool calls). `sources` and `citations` in a response or an SSE chunk become [sources and citations](./sources.md).
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

Data parts `data-ui-effect`, `data-ui-render` and `data-state` become GUI effects, rich content and shared state. `source-url` and `source-document` parts become [sources](./sources.md) (a document as a text-only reference) and `data-citations` (`{ citations }`) becomes citations.

## widget

`widget({ container?, layout?: 'floating' | 'sidebar' | 'inline', corner?, startOpen?, alwaysOpen?, title?, botName?, botJob?, avatar?, language?, strings?, theme?: 'auto' | 'light' | 'dark', color?: 'blue' | 'purple' | 'orange' | 'green', colors?, greeting?: string | string[] | { random: (string | string[] | { text, attributes? })[], experiment? }, disclaimer?, pace?, showActions?, showPrivacy?, autofocus?: boolean | { onLoad?: boolean, onClick?: boolean }, renderers?, sources?: { hosts?, action?, consulted? } | false })`

A Web Component (`<h4b-chat>`, shadow DOM) usable in any page or framework: safe Markdown, images, quick replies, action cards labelled by origin, a status line shared by all routes, paced bot messages, menu suggestions while typing, microphone and speaker controls (with `voice`), a message telling the user why listening failed or why the bot's voice did not come out (strings `micDenied`, `speechServiceOff`, `micMissing`, `voiceNetwork`, `voiceFailed`, `voiceOutputBlocked`, `voiceSpeakFailed`, replaceable through `strings`), attach and camera buttons (with `files` / `camera`), paste and drop. Style it with CSS variables (`--h4b-primary`, `--h4b-bg`, `--h4b-radius`…) or `::part()`. Add components for rich content with `renderers: { name: (props) => HTMLElement }`; `gallery` is built in. Sources of a reply show as numbered references and a list (cited, then consulted); `sources.action` runs a registered action instead of following the link ([Sources and citations](./sources.md#widget)).

`greeting` is shown and recorded when the conversation is empty. A string is one message; an array is several messages in order. To start each new conversation differently, use `{ random: [...] }`: the widget draws one option, and an option is a string or an array of messages. The option shown last is not drawn again in the same browser (its index is kept in `localStorage` under `h4b-widget-greeting`; without storage, every option can come up). Nothing is drawn or shown when the conversation already has messages when the widget mounts. `pickGreeting(greeting, previous?, random?)` is the same draw for an interface you build yourself. For an A/B test, an option can be `{ text, attributes }`: the widget sets the drawn option's attributes on the conversation and records an exposure; with `consent`, the last index only reaches `localStorage` with `persistence` ([Experiments](./experiments.md#the-greeting-as-an-experiment)).

```ts
widget({
  greeting: {
    random: [
      'Hi! How can I help?',
      ['Welcome back.', 'Ask me anything about this page.'],
      'Hello! Looking for something?',
    ],
  },
})
```

`autofocus` focuses the composer. Each behavior is its own switch. `true` or `{ onLoad: true }` focuses when the window opens, including a page that loads with the window already open. `{ onClick: true }` focuses when the user clicks anywhere on the page that is a plain spot: message text, empty space, the page around the chat. Clicks on buttons, links, other fields and text selections keep doing what they already do. With the window closed, a click does not open it. Phones often ignore the load focus until the first tap.

For a field you draw yourself, mark it and bind the same switches. `bindTextFocus` returns a function that removes the click listener:

```html
<input data-h4b-text>
```

```ts
import { bindTextFocus } from '@handsforbots/widget'

const stop = bindTextFocus({ onLoad: true, onClick: false })
```

`input` accepts the element, a CSS selector (`'#composer'`), or a function that returns the element. With `input` omitted, the first `[data-h4b-text]` on the page is the field. `within` limits clicks to one element (or a selector); the default is the whole document. A hidden or disabled field is left alone.

## react

`<H4BProvider value={h4b}>`, `useH4B()`, `useH4BState(selector)`, `useMessages()`, `useTurn()`, `useBusy()`, `useSharedState()`, `useAction(definition)` (registered while mounted, always calls the latest handler), `useContextSignal(key, value)`, `useH4BEvent(name, listener)`, `useStimulus(listener)`, `useStore(service)` (for stateful services like `voice`), `useSources(message)` ([sources](./sources.md) split from the text), `useTextFocus(ref, { onLoad?, onClick?, within? })`.

`useTextFocus` is the same pair of switches for a field you render. The ref names the element. `onLoad` focuses after mount, which is also when React's `autoFocus` prop focuses, and the hook runs again if you turn that switch on later. `onClick` focuses on a click anywhere that is a plain spot. The hook does not need `H4BProvider`.

```tsx
const field = useRef<HTMLInputElement>(null)
useTextFocus(field, { onLoad: true, onClick: true })
return <input ref={field} />
```

## vue

`app.use(h4bVue(h4b))` (or `provideH4B(h4b)` in a component), `useH4B()`, `useH4BState(selector)`, `useMessages()`, `useTurn()`, `useBusy()`, `useSharedState()`, `useAction(definition)`, `useContextSignal(key, refOrGetter)`, `useH4BEvent(name, listener)`, `useStimulus(listener)`, `useService(key)` (follows the service being provided or removed later), `useStore(refOrGetter)`, `useSources(refOrGetter)` ([sources](./sources.md) split from the text, as a computed ref), `useTextFocus(refOrGetter, { onLoad?, onClick?, within? })`, `v-text-focus`. State comes back as read-only shallow refs that trigger only when the selected value changes; registrations end with the component (or `effectScope`).

`v-text-focus` names the field: the element it sits on is the composer. `h4bVue` registers the directive (`vTextFocus` is the same directive, for a local import). `v-text-focus="true"` is the load switch. `v-text-focus="{ onLoad: true, onClick: false }"` sets each switch. The browser attribute `autofocus` is that load switch applied once, with no click behavior. `useTextFocus` takes a template ref when the directive is awkward.

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

`voice({ stt, tts?, language?, mode?: 'push-to-talk' | 'hands-free', output?: 'auto' | 'voice' | 'text', bargeIn?: true | { minWords?: 2, ignore? }, endOfTurn?, echo?: textEchoFilter() | EchoFilter | false, turn?: { silence?: 800, minSilence?: 300, maxSilence?: 2000, threshold?: 0.5, timeout?: 600, audioSeconds?: 8 }, voiceName?, load?: { start?: 'first-use' | 'eager' | 'idle' | 'manual', whileLoading?: 'fallback' | 'wait' | 'silent' }, effects?, player?, reactions?: true })`. With `reactions`, backchannels heard over the bot go to the backend on the next turn as `voice.reactions` ([Interruption and voice conversation](./conversation.md#barge-in)). `stt`/`tts` take a provider or a list (tried in order, falling back on network/support errors and when the browser's speech service is off).

| Provider | Notes |
|----------|-------|
| `webSpeechSTT({ continuous? })`, `webSpeechTTS({ voice?, rate?, pitch?, startTimeout? })` | Browser APIs; long texts are split into sentences. `webSpeechTTS` gets the effects' prosody only |
| `httpSTT({ url, headers?, parse?, silenceMs? })`, `httpTTS({ url, headers?, body?, prosody?, playback?: 'webaudio' \| 'element' })` | Your backend proxies any cloud provider (keys stay server-side); simple voice activity detection for hands-free. `httpTTS` decodes the audio and plays it through the effects; `prosody: true` sends the prosody in the body for your backend to apply |
| `websocketSTT({ url, sampleRate?, onOpen?, parse, finish?, endOfTurn? })` | Streams 16-bit PCM; `url` can be a function that fetches a short-lived token. `endOfTurn: true` when the service detects turns itself: `parse` returns `{ final, endOfTurn }` |
| `voskSTT({ url })` | Self-hosted Vosk server |
| `voskBrowserSTT({ modelUrl, load: () => import('vosk-browser'), grammar? })` | Offline, in the browser (WebAssembly); the model downloads once, then no audio leaves the device. `preload()` warms it up |

Service: `listen({ until? })`, `stop()`, `cancel()`, `endTurn()`, `discardTurn()`, `toggle()`, `setMode()`, `setOutput()`, `setEndOfTurn()`, `setEcho()`, `configure({ turn?, bargeIn? })`, `speak()`, `cancelSpeech()`, `loadSpeech(name?)`, `setTTS(providers)`, `setEffects(effects | null)`, `unlockAudio()`, `willSpeakReplies()` (whether a reply arriving now would be spoken), `getState()` (`phase`, `listening`, `speaking`, `synthesizing`, `partial`, `pauseSince`, `endOfTurnAt`, `endOfTurnCheckAt`, `interrupted`, `lastInput`, `endOfTurn`, `echo`, `effects`, `ttsStatus`, `error`…), `subscribe()`.

- **Speech synthesis.** Providers that return audio (`synthesize`: `httpTTS`, the models in `voice-models`) are played through Web Audio with the effects, and the next sentence is synthesized while the current one plays. `load` decides when models download (`start`) and who speaks meanwhile (`whileLoading`); `ttsStatus` has each provider's `state` (`unloaded`, `loading`, `ready`, `failed`) and progress. Audio is unlocked on the first gesture in the page. Guide: [Speech synthesis and voice effects](./speech.md).

- `stop()` ends listening and still sends what was said; `cancel()` ends it and discards the utterance (nothing is sent, including a final transcript the provider delivers late).
- Push-to-talk ends on the first pause by default (good for click-to-talk). `listen({ until: 'stop' })` is hold-to-talk: recognition keeps going across pauses (restarting if the browser ends its session), `partial` shows everything said so far, and one message goes out on `stop()`. The widget's mic button and the keyboard `talk` shortcut use it.
- `getState().error.code` is one of `not-supported`, `not-allowed` (the microphone was denied), `service-not-allowed` (the microphone is fine but the browser's speech service is off or blocked, e.g. dictation disabled in Safari; the next provider in the list is tried), `no-speech`, `audio-capture`, `network`, `output-blocked` (the browser blocked the bot's voice until the user interacts), `synthesis-failed` (the bot's voice failed or never started), `unknown`. `getState().error.stage` says where it failed: `listen` (hearing the user) or `speak` (saying the reply). Check `stage` before blaming the microphone: an error while speaking is never "I couldn't hear you". Use both to show the right help to the user; the widget already does. Every voice error also goes to the kernel's `error` event (`h4b.on('error', …)`) with `source: 'voice'`, or `voice:tts:<provider>` while speaking, so logs and observability see it.
- `voice.speech` reports each spoken chunk: `{ phase: 'start', provider, chars }`, then `{ phase: 'end', provider, ms, interrupted? }` or `{ phase: 'error', provider, code, message }`. A `start` with nothing after it means the voice went silent. Chunks of a reply also carry `messageId`, `from` and `to` (UTF-16 positions into the reply's text), and a chunk of a reply that was never spoken ends as `{ phase: 'skip', reason: 'no-provider' | 'cancelled' }`. Chunks from `speak(text)` have no position.
- `voice.track` (`{ messageId, speak }`) says, when a reply's text starts arriving, whether it will be spoken. Use it with `voice.speech` to sync the page with speech instead of guessing a delay (the `cues` plugin does it).
- `voice.tts` reports each speech provider's model and internals, `{ provider, event, ... }`, with no content: `load.start` (`size`), `load.progress` (each quarter of the download), `load.done` (`ms`), `load.error` (`message`), `load.aborted`, and `speech.while-loading` when a chunk is asked for before the model is ready (`policy`: the `whileLoading` in force; `action`: `fallback` with `to`, `wait` or `silent`). Providers with `trace(listener)` add their own steps (`workerTTS`: the worker's life and each request, below).
- When the last provider fails a sentence, the `error` event fires once, with `source: 'voice:tts:<provider>'`.
- Guide with examples, provider options and tuning: [Interruption and voice conversation](./conversation.md).
- **Continuous conversation (hands-free).** The microphone stays open; final results pile up in one pending turn (`partial` shows all of it) and go out as one message when the turn ends: after `turn.silence` of quiet, or, with an end-of-turn provider, as soon as it says the user finished (asked after `minSilence`, trusted from `threshold`, given up after `timeout`) and at the latest after `maxSilence`. Speaking again before that keeps the turn open. `endTurn()` sends it now ("send" button), `discardTurn()` drops it and keeps listening ("trash" button), `stop()` sends it and closes the microphone. If it already went out, the kernel joins the continuation to it while the reply has not started (see [Concepts](./concepts.md#input-while-busy)).
- **End-of-turn providers** (`EndOfTurn`: `{ name, input: 'text' | 'audio', historyTurns?, remote?, consent?, isSupported(), load?(), predict({ partial, history, language, audio? }, signal) → probability }`): `httpEndOfTurn({ url, headers?, parse?, historyTurns?, consent? })` asks your backend (a LiveKit turn-detector or BERT classifier, a typed-decision model, or your LLM; keys stay on the server). Local models (e.g. Smart Turn in ONNX) fit the same contract. Audio models need a recognizer that exposes audio (`capabilities.audio`: `websocketSTT`, `voskSTT`, `voskBrowserSTT`); Web Speech does not, so use a text model with it. A recognizer that detects the end of the turn itself (`capabilities.endOfTurn`, marking finals with `endOfTurn`) replaces the model. Without a provider, or while it loads, is denied consent, fails or is slow, silence decides. Switch it at runtime with `setEndOfTurn(provider | null)`; each call costs what your provider costs.
- **Barge-in.** Speech over the bot (speaking, or streaming a reply on screen) calls `h4b.interrupt()`: the speech stops, the reply is cancelled and the message keeps only the sentences already spoken. A live transcript needs `minWords` words; a final result always counts. Backchannels ("aham", "ok", "uh-huh"…, a list per language; replace it with `ignore`) never interrupt and are dropped. Pressing to talk while the bot answers interrupts too. `bargeIn: false` pauses recognition while the bot speaks instead.
- **Echo filter** (`EchoFilter`: `{ name, tail?, filter({ text, final, speech, language }) → text }`): drops what the microphone hears of the bot's own speech, so it neither interrupts nor answers itself. Asked for every live transcript and final result while the bot speaks and for `tail` ms after. Default `textEchoFilter({ threshold?: 0.6, minRun?: 2, tail?: 2000 })`: compares words, all or nothing, one word always passes. `echo: false` turns it off; `setEcho(filter | null)` at runtime. Details: [Echo filter](./conversation.md#echo-filter).
- Replies are spoken sentence by sentence as they stream, so speech starts before the reply ends.
- `phase` is `idle`, `listening`, `userSpeaking`, `waitingEndOfTurn` (until `endOfTurnAt`) or `botSpeaking`; `interrupted` is true after the user cut the last reply. Every interruption, ignored backchannel or echo and end of turn is reported on the `voice.decision` event.
- Providers say whether audio or text leaves the page (`remote`; `webSpeechSTT` counts as remote, since browsers like Chrome send audio to their service) and may require a consent purpose (`consent`, see [Consent](./consent.md)): while it is not granted they are skipped. Showing the notice is the app's job. Microphone providers open it with echo cancellation, noise suppression and automatic gain; Web Speech manages its own microphone.
- `webSpeechSTT` reports itself as unsupported outside a secure context (plain `http`), so `supported.stt` is `false` there unless another provider works.
- `webSpeechSTT({ continuous: 'auto' })` (default) uses the browser's continuous recognition for hold-to-talk and hands-free, except on Android, where Chrome repeats what was already said in that mode: there each session hears one utterance and the voice service starts the next, so a word spoken right at the restart can be lost. `continuous: true` forces the browser's continuous mode, `false` turns it off everywhere.

## voice-models

Speech providers that run neural models in the page. They plug into `voice({ tts })`; nothing heavy is imported until a model loads (pass `runtime: () => import('onnxruntime-web')`).

| Provider | Options |
|----------|---------|
| `piperTTS({ model, config, phonemizer, runtime, speaker?, noiseScale?, lengthScale?, noiseW?, sessionOptions?, cache?, size?, name? })` | Piper (VITS) voices. `piperVoice('pt_BR-faber-medium')` gives `{ model, config }` on Hugging Face. Rate through `length_scale` |
| `kokoroTTS({ model, tokenizer, voices, voice?, phonemizer, runtime, language?, sessionOptions?, cache?, size?, name? })` | Kokoro 82M. `kokoroModel({ dtype?: 'q8', voices, revision? })` gives the Hugging Face files. The voice language follows its first letter (`p` → Brazilian Portuguese) |
| `transformersTTS({ name, pipeline, call?, prosody?, size? })` | Any transformers.js `text-to-speech` pipeline; `transformersProgress(onProgress)` adapts its progress events |
| `espeakPhonemizer({ module, wasm, data, voices?, cache?, size? })` | Text to phonemes with espeak-ng (GPL-3.0, not shipped: you pass the piper-phonemize build) |
| `workerTTS({ worker, config?, name?, size?, prosody? })` + `serveTTS(provider \| (config) => provider)` | Runs any provider with `synthesize` in a Web Worker, so synthesis never freezes the page. `serveTTS` goes in the worker file; `workerTTS` returns the provider for the page (`terminate()` stops the worker). Requests wait until the worker says it is listening (`ready`), and the config is sent again then, so a browser that drops the first messages to a loading module worker still gets it. `trace(listener)` reports each step with a number per worker (`worker.created`, `worker.init` with `attempt`, `worker.ready`, `worker.info` with `inits`, `request`, `reply`, `request.error`, `request.aborted`, `reply.stale`, `worker.error`, `worker.terminated`); `voice` emits them as `voice.tts`. [Guide](./speech.md#running-the-model-in-a-worker) |

Sources (`ModelSource`): a URL (absolute or relative to the page), `huggingFace(repo, file, { revision?, endpoint? })`, a `Blob`, an `ArrayBuffer`/`Uint8Array`, or an async function returning any of them. `fetchModel(source, { onProgress?, signal?, cache?, fetch? })` downloads with progress and keeps the file in Cache Storage (`h4b-voice-models`; `cache: false` turns it off); `clearModelCache()` erases it. Guide: [Speech synthesis and voice effects](./speech.md).

## voice-effects

`voiceEffects(chain | preset = 'clean', { effects? })` → a live effects chain for `voice({ effects })`: `get()`, `set(chain | preset)`, `update(index | id, patch)`, `setProsody(prosody)`, `subscribe()`, `definitions()`, `render(audio)`.

- A chain is JSON: `{ version: 1, name?, description?, prosody?: { rate?, pitch?, volume? }, effects: [{ type, id?, bypass?, ...params }] }`. Types and parameter names follow Web Audio; parameter descriptors follow Web Audio Modules; prosody uses SSML units (semitones, dB).
- Effect types: `highpass`, `lowpass`, `bandpass`, `peaking`, `lowshelf`, `highshelf`, `notch`, `allpass`, `gain`, `compressor`, `limiter`, `gate`, `varispeed`, `vibrato`, `tremolo`, `chorus`, `delay`, `reverb`, `distortion`, `ringmod`, `dispersion`. Add yours with `defineEffect({ type, label, params, process?, build?, tail?, speed?, ffmpeg? })`.
- Presets (`presets`): `clean`, `denoise`, `radio`, `telephone`, `megaphone`, `robot`, `underwater`, `cave`, `ice`, `chipmunk`, `giant`.
- `validateChain(chain)` lists every problem; `chainSchema()` is the JSON Schema; `fx.render(audio)` renders offline (tails included).
- Bridges: `toSSML(text, prosody, { language?, voice?, pitch?: 'st' | '%', fragment? })` and `toFFmpeg(chain | preset, { sampleRate?, prosody? })` → `{ filter, warnings, command(input, output) }`.
- The package only needs `@handsforbots/voice` for types: chains, SSML and FFmpeg export also work outside H4B (a build script, a server).

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

## cues

`cues({ channels, rules?, classify?, report?: false, action?: true, sync?: 'speech' })`. Cues are presentation categories with a closed vocabulary that the page reacts to: a character's mood, the scenery, a support conversation's urgency, the conversation mode (ADR 0018). Each channel declares its values (codes, `[A-Za-z0-9_.:-]{1,64}`), a `default`, `persist` (`'message'`, the default, goes back to `default` on a message without a value; `'sticky'` keeps the previous one) and an optional `repeat` policy per value. The display label and what each value does are yours.

```ts
cues({
  channels: {
    tone: {
      values: ['neutral', 'curious', 'happy', 'excited', 'confused', 'serious', 'offended'],
      default: 'neutral',
      repeat: {
        confused: { levels: [2, 4] },                         // level 2 from the 2nd in a row, 3 from the 4th
        offended: { max: 1, by: 'count', then: 'serious' },  // warns once per conversation
      },
    },
    scene: { values: ['day', 'night', 'workshop'], default: 'day', persist: 'sticky' },
  },
  classify: (source) => (source.url?.includes('/projects/') ? ['projects'] : []),
  rules: [
    { when: { taxonomy: 'projects' }, set: { tone: 'excited' } },
    { when: { event: 'action.failed' }, set: { tone: 'confused' } },
  ],
  report: true,
})
```

Values come from three places, all validated: a value outside the list becomes the `default` and an unknown channel is dropped, both with an `error` (`source: 'cues'`).

- **Backend stimulus**: `ui.effect` named `cues` with `{ tone: 'curious' }` or `{ tone: { value: 'confused', level: 3 } }`, plus an optional `messageId`. Without it, the value goes to the turn's next reply with text. It shows right away, with `pending: true`, and is stored when the message ends; naming a message that was already stored decides it again.
- **Action `set_cues`**: for backends that only use tool calling. Its JSON Schema has one `enum` per channel (`description` of the channel goes with it); it runs for origins `assistant` and `agent` without confirmation and returns the state applied. `action: false` leaves it out; a string renames it.
- **Rules**: `{ when, set, priority? }`, run when an assistant message ends. `when` is a function of `{ message, text, sources, taxonomies, actions, errors, interrupted, trigger }` or an object whose keys must all match: `source` (`urlPrefix`, `trail`, `title`, `taxonomy`), `taxonomy` (from `classify(source)`), `action`, `event` (`error`, `action.failed`, `interrupted`), `trigger` (the modality that started the turn) and `text` (a RegExp).

Precedence per channel and message: backend, then rules (highest `priority`; ties go to the last one declared), then `sticky` or `default`. The repetition policy comes last. `levels` raise the level as the value repeats (`by: 'streak'`, the default, counts messages in a row; `'count'`, the whole conversation); a level sent by the backend is kept within the declared range. `max` limits how many times the value applies: past it, it becomes `then` (or the `default`), stored with `from: 'repeat'` and `requested`. H4B only applies the policy to what the page shows; what the assistant says is still the backend's, so turn `report` on with `max`: every request carries the context signal `cues.state` (`{ tone: { value, streak, count, level, requested? } }`).

With `voice`, a reply that will be spoken (`voice.track`) shows its cues when its first chunk starts playing (`voice.speech` with its `messageId`), not when it arrives: the character changes when the voice gets to that reply, after whatever was still playing, with no fixed delay. It also shows them if that chunk fails or is skipped, and on `h4b.interrupt()`. Replies that are not spoken show them on arrival, and so does everything with `sync: 'arrival'`. Until then `getState()` keeps the previous state; `report` and the `set_cues` result already carry what was decided. Replies without text (only tool calls) get no cues. Each reply stores what was decided as a `data` part named `cues` (`{ tone: { value, level, from, requested? } }`), so storage, restore and `tab-sync` bring the state back and counts are rebuilt from history; rules never run again on old messages, and `reset()` goes back to the defaults. Transports that send `data` parts to the backend send it too.

The `cues` service has `getState()` (per channel: `value`, `previous`, `streak`, `count`, `level`, `from`, `requested?`, `messageId?`, `pending?`), `subscribe()`, `channels` and `schema()`. Events: `cue.changed` (`{ channel, ...state }`, when something changed) and `cue.repeat` (`{ channel, value, level, streak, count, replaced?, messageId }`, when a level is reached or a value replaced). With React, `useStore(useH4B().get('cues'))`; with Vue, `useStore(useService('cues'))`. The widget mirrors each channel as `data-cue-<channel>` and `data-cue-<channel>-level` on `<h4b-chat>`, for CSS:

```css
h4b-chat[data-cue-tone='confused'][data-cue-tone-level='3'] .avatar { animation: wobble 0.6s; }
```

## memory

Mounted by `createH4B` by default; `createH4B({ memory: { … } })` tunes it, `memory: false` unplugs it, and a `memory(...)` in `plugins` replaces it.

`memory({ send?: 20 | 'all' | 'none', keep?: 100 | 'all', compact?: 'local' | false | Summarizer, maxSummaryChars?: 4000 })`. Counts **turns** (one kernel job: a user message and its answer, a `runAction`, a `push`; messages carry `turnId`). Sends the last `send` turns and folds older ones into the context signal `memory.summary` (`'local'` without an LLM, or `httpSummarizer({ url })` → your backend gets `{ previous, messages }` and answers `{ summary }`); keeps the last `keep` turns in the history, removing only what is already summarized. Service `memory`: `options`, `summary`, `view(request)`, `maintain()`; event `memory.changed`. Guide: [Persistence, memory and privacy](./persistence.md).

## storage-local

Keeps the conversation in the browser. **Encrypted by default** (AES-GCM): the key lives outside the stored data and expires, so after the deadline nothing readable is left, even if the person never comes back to the site.

```ts
storageLocal() // key in a cookie that expires after 30 min without use
storageLocal({ keySource: cookieKey({ ttlMinutes: 15, path: '/app' }) })
storageLocal({ keySource: backendKey({ url: '/api/h4b/key' }) }) // your server keeps the key and decides when it expires
storageLocal({ retention: 'tab', userChoices: ['key', { ttlMinutes: 5 }] })
```

| Option | Default | |
|---|---|---|
| `encrypt` | `true` | `false` stores plain JSON (and drops encrypted leftovers) |
| `keySource` | `cookieKey()` | `cookieKey({ ttlMinutes: 30, name: 'h4b-key', path: '/', domain?, sameSite: 'Strict' })` or `backendKey({ url, ttlMinutes?, headers?, credentials: 'same-origin', fetch? })` |
| `retention` | `'key'` | `'key'` (until the key expires), `{ ttlMinutes }` (also deleted after that much inactivity), `'tab'` (sessionStorage, gone when the tab closes) |
| `userChoices` | `[]` | Retentions the end user may pick; the widget shows them |
| `key` | `'h4b:conversation'` | |

- The cookie key is renewed on every load and save (`Max-Age`, `SameSite=Strict`, `Secure` on https). It is readable by the page's scripts and travels with requests to its `path` (about 60 bytes).
- `backendKey` protocol: `GET url` → `200 { "key": "<base64url, 32 bytes>" }` (renewing it) or `404`; `POST url` → `200` with the existing key or a new one. The server finds the user by its own session (HttpOnly cookie, sent with `credentials: 'same-origin'`). The key is fetched on every load and save and kept only in memory.
- Without a key the data can't be read: it is deleted on the next load or by the sweep that runs every minute. If there's no key source (no Web Crypto, cookies blocked), nothing is saved and `save()` reports an `error` with source `storage`.
- Blobs are replaced by placeholders.
- **It doesn't protect against XSS:** a script injected in the page can read the key. It limits how long the conversation stays readable in the browser.
- Requires the consent purpose `persistence` when `createH4B` has `consent`: nothing (not even the key cookie) is written before it is granted; on revoke, the conversation, the retention choice and the key are erased (`backendKey` gets `DELETE url`). See [Consent](./consent.md).

## storage-backend

Keeps the conversation on your server.

```ts
storageBackend({ url: '/api/h4b/conversation', retention: 'server', userChoices: [{ ttlMinutes: 30 }, 'tab'] })
```

`GET url` loads (`200` snapshot, or `204`/`404`), `PUT url` saves the snapshot (JSON, Blobs replaced by placeholders), `DELETE url` clears. Every request carries `X-H4B-Conversation` (a random id kept in localStorage, or sessionStorage with `'tab'`, so a closed tab can't reach it again) and `X-H4B-Retention` (`server`, `tab` or the TTL in minutes); your server enforces the retention. Anyone holding the id can read the conversation: tie it to the user's session when there is one. Options: `url`, `retention` (`'server'`), `userChoices`, `headers`, `credentials` (`'same-origin'`), `fetch`, `idKey`.

With `createH4B({ consent })` it requires `persistence`, sends the granted purposes in `X-H4B-Consent` (e.g. `persistence,review`) and saves again when they change; on revoke it sends `DELETE` and forgets the id. See [Consent](./consent.md).

## Retention

Both storages provide the `retention` service (`RetentionControl` in `core`): `current`, `choices` (the developer's default followed by `userChoices`), `location` (`'browser'` or `'server'`), `encrypted`, `keyTtlMinutes`, `set(retention)` (moves what is stored and remembers the choice in this browser, for every tab) and `subscribe`. The widget shows a 🔒 button with where the conversation is kept, the choices and *Delete the conversation now* (`widget({ showPrivacy: false })` hides it).

## tab-sync

`tabSync({ mode?: 'sync', channel?, throttleMs?, context? })`.

| `mode` | Behavior |
|---|---|
| `sync` (default) | Tabs share one conversation; histories of the same thread are merged by message id, a different thread replaces |
| `notify` | Each tab has its own conversation; the others get the `tabs.activity` event (`{ kind: 'action', name, origin, ok, error? }`, `{ kind: 'turn', phase, route }` for assistant turns, `{ kind: 'reset' }`, plus `tab` and `at`) and a context signal `tab-sync.activity` with the last `context.limit` (10) activities, so the assistant knows; `context: false` keeps only the event |
| `off` | Isolated tabs: nothing is broadcast |

With `notify` or `off`, pair it with the `'tab'` retention: otherwise tabs that save to the same localStorage key (or the same backend id) overwrite each other's conversation.

`tab-sync` is not gated by consent: it keeps nothing, it only shares the conversation in memory between open tabs.

## consent

Rule sets and helpers for `createH4B({ consent })` (the mechanism itself is in `core`). Guide: [Consent](./consent.md).

- `lgpd`, `gdpr`, `ccpa`, `optIn` and `presets` (all four): starting points with the purposes `persistence`, `review` and `analytics`; also as `@handsforbots/consent/rules/*.json`.
- `loadConsentRules(url, { parse?, fetch? })`: fetches one rule set or a list (JSON, or YAML with `parse: YAML.parse`) and validates it.
- `regionFromMeta(name = 'h4b-region')`, `regionFromUrl(url)`: the visitor's region, from the page or an endpoint of yours.
- `redact({ patterns?, custom?, replace?, media?: 'omit' | 'keep', hooks?: ['storage.before'], when? })`: anonymizes emails, phone numbers, CPF, CNPJ and card numbers (and media) in what is stored, optionally only while a purpose (e.g. `review`) is granted. Also `redactText`, `redactMessages`, `redactor`, `PATTERNS`.

## testkit

For plugin and transport authors: `scriptedTransport`, `reply`, `citedReply` (sources, clean text and citations, like a RAG backend), `eventually`, `waitForIdle` and `transportConformance(name, { create(scenario) })`, a Vitest suite (text answer, client action round trip, backend error, abort) that every transport in this repository passes.

## observability

`observability({ includeContent?: false, ...createObservabilityOptions })`. Turns, per-route phases, actions, signals and stimuli as semantic events, plus perceived latency per route (`h4b_first_response_ms`, `h4b_turn_duration_ms`) to tune direct commands against LLM answers, for Grafana (Faro/OTel), Langfuse and LangSmith. With `voice`, it also records each spoken chunk (`voice.speech.start`, `.end`, `.error`), `voice.decision` (transcripts only with `includeContent`) and every `voice.tts` event as `voice.tts.<event>` (model loading, speech while it loads, the speech worker's life); errors carry their `code` and `stage`. With `cues`, it records `cue.changed` and `cue.repeat` (codes only). It records the browser at start (`client.environment`: `userAgent`, `language`). Conversation attributes go on every span and, from `getTraceHeaders()`, to your backend as W3C `baggage`; exposures and each conversation's first visitor turn become `experiment.exposed` and the counters `h4b_experiment_exposed_total` and `h4b_conversation_engaged_total`, also for exposures from before `analytics` was granted. `@handsforbots/observability/server` reads the header on your backend ([Experiments](./experiments.md)).

To debug on a phone, without devtools: add the `devPanel` exporter (`observability({ exporters: ['memory', 'devPanel'] })`) and turn it on in that browser with `localStorage.setItem('semantic-event-observability:debug', 'true')`, then reload. A floating panel lists the latest events, and its export button downloads them with the browser (`environment`: user agent, language, platform, viewport). See [`packages/semantic-event-observability`](../../packages/semantic-event-observability/README.md) and [`examples/OBSERVABILITY.md`](../../examples/OBSERVABILITY.md).
