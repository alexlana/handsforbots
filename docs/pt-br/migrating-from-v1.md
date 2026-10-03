# Migrando da v1

A v2 é uma reescrita: não há camada de compatibilidade. A configuração sai de `new Bot({ core, plugins, engine })` para `createH4B({ plugins })`, e cada capacidade é um pacote.

| v1 | v2 |
|----|----|
| `new Bot({ engine: 'rasa', engine_endpoint })` | `rasa({ url })` |
| `engine: 'universal-llm'` | `universalLLM({ url, provider, model })` |
| `engine: 'openai'`, `'insecure-local-ollama'` | `openAICompatible({ baseUrl, model })` (só desenvolvimento com chave no navegador) |
| Core Input/Output `Text`, layouts, cores | `widget({ layout, color, botName, avatar, … })` |
| Core Input/Output `Voice`, Vosk remoto | `voice({ stt: [webSpeechSTT(), voskSTT({ url })], tts: webSpeechTTS() })`, `keyboard()` |
| `Poke` (`bot.input('poke', …)`) | `h4b.signal({ … })`, `gui()` (`data-h4b-say`, reengajamento por inatividade) |
| `BotsCommands` + action tags `[•{"action":…}•]` | Ações registradas + tool calls; o Rasa usa `custom.h4b.action` |
| `GUIDed` (`newGuide`, `redirect_input`, Fuse.js) | `guided({ tours })` com as ações `guided_tour` / `guided_highlight` e navegação fuzzy |
| `ShowRelevantContent`, `ImageGallery` (tools MCP via prompt) | `guided({ sectionsAttribute, gallery: true })`: `show_section`, `image_gallery` |
| `MCPHelper` (instruções de tools no prompt, parse de `<tool>`) | Tool calling nativo pelo transporte; ações se descrevem com JSON Schema |
| `Photo` | `camera()` (e `files()` para uploads) |
| Plugin `Observability` | `observability({ … })` (mesmos exporters) |
| `Analytics` | Aposentado: use os exporters do `observability` |
| `HexPresentation` | Aposentado (específico de portfólio) |
| `SessionManager`, `BackendSessionManager`, criptografia | `storageLocal({ ttlMinutes: 30 })`; sessões no backend com `http({ session })` / `universalLLM`. A criptografia local saiu: a chave ficava ao lado do dado |
| Sincronização entre abas por `BroadcastChannel` | `tabSync()` |
| `quick_start`, `presentation`, `disclaimer` | Listas de plugins; `widget({ greeting, disclaimer })` |
| Eventos `core.*` | `on('turn.status' \| 'signal' \| 'stimulus' \| 'action.invoked' …)` e interceptadores |
| Vosk no navegador (WASM) | `voskBrowserSTT({ modelUrl, load: () => import('vosk-browser') })` |
