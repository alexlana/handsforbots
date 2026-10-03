# Migrating from v1

v2 is a rewrite: there is no compatibility layer. Configuration moves from `new Bot({ core, plugins, engine })` to `createH4B({ plugins })`, and every capability is a package.

| v1 | v2 |
|----|----|
| `new Bot({ engine: 'rasa', engine_endpoint })` | `rasa({ url })` |
| `engine: 'universal-llm'` | `universalLLM({ url, provider, model })` |
| `engine: 'openai'`, `'insecure-local-ollama'` | `openAICompatible({ baseUrl, model })` (dev only with a browser key) |
| Core Input/Output `Text`, layouts, colors | `widget({ layout, color, botName, avatar, … })` |
| Core Input/Output `Voice`, Vosk remote | `voice({ stt: [webSpeechSTT(), voskSTT({ url })], tts: webSpeechTTS() })`, `keyboard()` |
| `Poke` (`bot.input('poke', …)`) | `h4b.signal({ … })`, `gui()` (`data-h4b-say`, idle re-engagement) |
| `BotsCommands` + action tags `[•{"action":…}•]` | Registered actions + tool calls; Rasa uses `custom.h4b.action` |
| `GUIDed` (`newGuide`, `redirect_input`, Fuse.js) | `guided({ tours })` with `guided_tour` / `guided_highlight` actions and fuzzy navigation |
| `ShowRelevantContent`, `ImageGallery` (MCP tools via prompt) | `guided({ sectionsAttribute, gallery: true })`: `show_section`, `image_gallery` |
| `MCPHelper` (tool instructions in the prompt, `<tool>` parsing) | Native tool calling through the transport; actions describe themselves with JSON Schema |
| `Photo` | `camera()` (and `files()` for uploads) |
| `Observability` plugin | `observability({ … })` (same exporters) |
| `Analytics` | Retired: use `observability` exporters |
| `HexPresentation` | Retired (portfolio-specific) |
| `SessionManager`, `BackendSessionManager`, encryption | `storageLocal({ ttlMinutes: 30 })`; backend sessions in `http({ session })` / `universalLLM`. Local encryption was dropped: the key lived next to the data |
| `BroadcastChannel` tab sync | `tabSync()` |
| `quick_start`, `presentation`, `disclaimer` | Plugin lists; `widget({ greeting, disclaimer })` |
| `core.*` events | `on('turn.status' \| 'signal' \| 'stimulus' \| 'action.invoked' …)` and interceptors |
| In-browser Vosk (WASM) | Not ported yet (roadmap) |
