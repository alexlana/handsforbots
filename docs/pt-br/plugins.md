# Plugins

Cada pacote exporta uma fábrica de plugin: chame com as opções e passe para `createH4B({ plugins })`. Serviços opcionais (voz, menu, arquivos, câmera…) são descobertos em runtime: o widget, por exemplo, só mostra o microfone quando `voice` está instalado.

| Pacote | Plugin(s) | Fornece |
|--------|-----------|---------|
| [`core`](#core) | — | kernel |
| [`transport-agui`](#transport-agui) | `agui` | `transport` |
| [`transport-rasa`](#transport-rasa) | `rasa` | `transport` |
| [`transport-http`](#transport-http) | `http`, `universalLLM`, `openAICompatible` | `transport` |
| [`transport-ai-sdk`](#transport-ai-sdk) | `aiSdk` | `transport` |
| [`widget`](#widget) | `widget` | — |
| [`react`](#react) | hooks | — |
| [`copilotkit`](#copilotkit) | `useCopilotKitBridge`, `<CopilotKitBridge>` | `transport` (opcional) |
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
| [`testkit`](#testkit) | utilitários de teste, `transportConformance` | — |

## core

```ts
const h4b = createH4B({
  plugins: [...],
  actions: [...],            // registradas na hora
  threadId?: string,
  matchThreshold?: 0.75,     // confiança mínima para comandos diretos
  maxActionRoundtrips?: 5,   // idas e voltas assistente ↔ ações por turno
  onError?: (error, source) => void,
})
await h4b.start()
```

API principal: `signal()`, `send()`, `ask()`, `runAction()`, `push()`, `abort()`, `reset()`, `actions.register()`, `provide()/get()`, `on()/when()`, `intercept()`, `addMatcher()`, `capture()`, `subscribe()/getSnapshot()`, `use(plugin)`, `stop()`.

## transport-agui

`agui({ url, headers?, agent?, forwardedProps? })`: HTTP POST + SSE. `headers` pode ser uma função (renovar tokens, cabeçalhos de trace). `agent` aceita qualquer agente AG-UI (ex.: `new HttpAgent()` de `@ag-ui/client`, ou um local). Eventos CUSTOM `h4b.ui.effect` e `h4b.ui.render` viram efeitos na GUI e conteúdo rico.

## transport-rasa

`rasa({ url, headers?, sender?, metadata?, reportActionResults? })`: canal REST. O id da conversa no H4B é o sender do Rasa; sinais de contexto vão em `metadata.h4b_context`. Texto, imagens e botões viram balões e respostas rápidas (o clique envia o payload do botão). O Rasa pode comandar a interface com `custom`:

```yaml
responses:
  utter_mostra_salvar:
  - text: Está aqui!
    custom:
      h4b:
        action: { name: guided_highlight, args: { target: '#save_button', text: 'Salve aqui' } }
        # effect: { name: scroll, value: '#top' }
        # render: { component: gallery, props: { images: [...] } }
```

## transport-http

- `http({ url, method?, headers?, session?, body?, parse?, parseChunk?, sendToolResults? })`: API genérica de turnos. `session: { url, method, extract }` abre uma sessão no backend por conversa (com o id da conversa como reserva). Respostas: texto puro, `{ response | content | text | message }`, listas de mensagens (`text`, `image`, `buttons`), chat completions, `tool_calls`; `text/event-stream` é lido em streaming (deltas no estilo OpenAI, tool calls fragmentadas).
- `universalLLM({ url, provider?, model?, systemPrompt?, contextWindow?, parameters?, stream?, backendSession? })`: o formato de requisição do UniversalLLM da v1, com histórico, tools e contexto.
- `openAICompatible({ baseUrl, model, systemPrompt?, apiKey?, stream?, temperature? })`: `/chat/completions` com tools nativas. Uma chave no navegador é pública: use para desenvolvimento local (ex.: Ollama em `http://localhost:11434/v1`) ou aponte `baseUrl` para o seu proxy.

## transport-ai-sdk

`aiSdk({ url, headers?, body?, fetch? })`: conversa com uma rota do Vercel AI SDK que devolve `streamText(...).toUIMessageStreamResponse()`. A requisição segue o `DefaultChatTransport` (`id`, `messages` como UIMessages, `trigger`) e acrescenta `tools` (as ações do H4B) e `context`; declare as tools sem `execute` na rota para o cliente executá-las:

```ts
export async function POST(req: Request) {
  const { messages, tools, context } = await req.json()
  return streamText({
    model,
    system: `Tela: ${JSON.stringify(context)}`,
    messages: await convertToModelMessages(messages),
    tools: Object.fromEntries(tools.map((t) => [t.name, tool({ description: t.description, inputSchema: jsonSchema(t.parameters) })])),
  }).toUIMessageStreamResponse()
}
```

Data parts `data-ui-effect`, `data-ui-render` e `data-state` viram efeitos na GUI, conteúdo rico e estado compartilhado.

## widget

`widget({ container?, layout?: 'floating' | 'sidebar' | 'inline', corner?, startOpen?, alwaysOpen?, title?, botName?, botJob?, avatar?, language?, strings?, theme?: 'auto' | 'light' | 'dark', color?: 'blue' | 'purple' | 'orange' | 'green', colors?, greeting?, disclaimer?, pace?, showActions?, autofocus?, renderers? })`

Um Web Component (`<h4b-chat>`, shadow DOM) que funciona em qualquer página ou framework: Markdown seguro, imagens, respostas rápidas, cartões de ação identificados por origem, linha de status comum a todas as rotas, cadência entre mensagens do bot, sugestões do menu ao digitar, controles de microfone e alto-falante (com `voice`), botões de anexo e câmera (com `files` / `camera`), colar e arrastar. Estilize com variáveis CSS (`--h4b-primary`, `--h4b-bg`, `--h4b-radius`…) ou `::part()`. Adicione componentes para conteúdo rico com `renderers: { nome: (props) => HTMLElement }`; `gallery` já vem pronto.

## react

`<H4BProvider value={h4b}>`, `useH4B()`, `useH4BState(selector)`, `useMessages()`, `useTurn()`, `useBusy()`, `useSharedState()`, `useAction(definição)` (registrada enquanto o componente existe, sempre chama o handler mais recente), `useContextSignal(key, valor)`, `useH4BEvent(nome, listener)`, `useStimulus(listener)`, `useStore(serviço)` (para serviços com estado, como `voice`).

## vue

`app.use(h4bVue(h4b))` (ou `provideH4B(h4b)` num componente), `useH4B()`, `useH4BState(seletor)`, `useMessages()`, `useTurn()`, `useBusy()`, `useSharedState()`, `useAction(definição)`, `useContextSignal(key, refOuGetter)`, `useH4BEvent(nome, listener)`, `useStimulus(listener)`, `useService(chave)` (acompanha o serviço sendo fornecido ou removido depois), `useStore(refOuGetter)`. O estado volta como shallow refs somente leitura que só disparam quando o valor selecionado muda; os registros acabam junto com o componente (ou `effectScope`).

```ts
const estadoDaVoz = useStore(useService('voice'))   // listening, speaking, partial…
const mensagens = useMessages()
```

## copilotkit

Dentro de `<CopilotKitProvider>` e `<H4BProvider>`: `useCopilotKitBridge({ agentId?, transport?, contextDescription? })`. As ações do H4B viram frontend tools do CopilotKit, os sinais de contexto viram contexto do agente e (salvo `transport: false`) o agente do CopilotKit vira o transporte do H4B, então voz, fallbacks do menu e sensores chegam a ele e as respostas podem ser faladas. Comandos diretos são espelhados no histórico do agente.

## assistant-ui

`useH4BAssistantRuntime()` devolve um runtime do assistant-ui apoiado no H4B: `<AssistantRuntimeProvider runtime={useH4BAssistantRuntime()}><Thread /></AssistantRuntimeProvider>`. O assistant-ui desenha a thread e o composer; tool calls aparecem com seus resultados, conteúdo rico chega como partes `data-h4b-ui`, cancelar aborta o turno do H4B. Qualquer transporte funciona por trás.

## menu

`menu({ commands, language?, fuzzyThreshold?: 0.8, maxFuzzyWords?: 6 })`. Um comando: `{ action, label?, slash?, patterns?, phrases?, args?, reply? }`.

- `slash: 'atrasados'` → `/atrasados …` (o resto da linha vira `rest`).
- `patterns: ['mostrar pedidos {status}', /^pedidos? (?<status>\w+)$/]`: templates sem diferenciar maiúsculas e acentos, ou RegExps com grupos nomeados.
- `phrases: { pt: ['pedidos atrasados'], en: ['late orders'] }`: reconhecimento tolerante a erros para entradas curtas (ótimo com voz).
- Serviço: `suggest(texto)`, `list()`, `add(comando)`, `commandSignal(ação, args, rótulo)` para botões e paletas.

## voice

`voice({ stt, tts?, language?, mode?: 'push-to-talk' | 'hands-free', output?: 'auto' | 'voice' | 'text', bargeIn?: true, bargeInChars?: 4, voiceName? })`. `stt`/`tts` recebem um provedor ou uma lista (testados em ordem, com troca em erro de rede ou suporte).

| Provedor | Observações |
|----------|-------------|
| `webSpeechSTT()`, `webSpeechTTS({ voice?, rate?, pitch? })` | APIs do navegador; textos longos são divididos em frases |
| `httpSTT({ url, headers?, parse?, silenceMs? })`, `httpTTS({ url })` | Seu backend faz proxy para qualquer provedor em nuvem (chaves ficam no servidor); detecção simples de fala para mãos-livres |
| `websocketSTT({ url, sampleRate?, onOpen?, parse, finish? })` | Envia PCM 16 bits em streaming; `url` pode ser uma função que busca um token temporário |
| `voskSTT({ url })` | Servidor Vosk próprio |
| `voskBrowserSTT({ modelUrl, load: () => import('vosk-browser'), grammar? })` | Offline, no navegador (WebAssembly); o modelo é baixado uma vez e depois nenhum áudio sai do dispositivo. `preload()` adianta o download |

Serviço: `listen({ until? })`, `stop()`, `cancel()`, `toggle()`, `setMode()`, `setOutput()`, `speak()`, `cancelSpeech()`, `getState()` (`listening`, `speaking`, `partial`, `lastInput`, `error`…), `subscribe()`.

- `stop()` encerra a escuta e ainda envia o que foi dito; `cancel()` encerra e descarta a fala (nada é enviado, nem uma transcrição final que o provedor entregue depois).
- No push-to-talk a fala termina na primeira pausa por padrão (bom para clicar e falar). `listen({ until: 'stop' })` é segurar para falar: o reconhecimento continua entre pausas (reiniciando se o navegador encerrar a sessão), `partial` mostra tudo o que foi dito até ali e uma única mensagem sai no `stop()`. O botão de microfone do widget e o atalho `talk` do teclado usam esse modo.

## keyboard

`keyboard({ talk?: 'Alt+KeyM', interrupt?: 'Escape', palette?: 'Mod+KeyK', target? })`. Segure `talk` para falar, enviado ao soltar (alterna em mãos-livres), `interrupt` para a fala e cancela o turno atual, `palette` emite `keyboard.palette` para a sua paleta de comandos. `false` desliga um atalho.

## inputs

- `camera({ facingMode?, maxSide?: 1280, mimeType?, quality? })`: serviço `open(video?)`, `capture(pergunta?)` (envia uma foto), `frame()`, `startFrames(intervalMs)` (último quadro como contexto `camera.frame`), `stopFrames()`, `close()`.
- `files({ accept?, maxSizeMB?: 10, maxFiles?: 5 })`: serviço `pick(pergunta?)`, `attach(arquivos, pergunta?)`.
- `gui({ route?, selection?, declarative?, idle? })`: rota e seleção como contexto; atributos `data-h4b-say`, `data-h4b-command` + `data-h4b-args`, `data-h4b-context` + `data-h4b-value`; `idle: { minutes, text }` reengaja uma vez após inatividade.
- `sensors({ enable?, throttleMs? })`: `geolocation`, `orientation`, `network` como sinais de contexto, opt-in via `enable` ou pelo serviço.

## guided

`guided({ tours?, autoStart?, language?, narrate?, vocabulary?, sectionsAttribute?, gallery? })`. Ações: `guided_tour` (`{ name }` ou `{ steps }`), `guided_highlight` (`{ target, text?, title? }`), `guided_close`, além de `show_section` (com `sectionsAttribute`) e `image_gallery` (com `gallery: true`). Um passo: `{ title?, text, target?, next?, previous?, close? }`; os alvos são encontrados também dentro de shadow roots abertos (ex.: `#chat_input` no widget). Com um tour aberto, "próximo", "voltar", "pular" (e equivalentes em inglês), digitados ou falados, navegam; outras perguntas continuam indo ao assistente.

## expose-webmcp

`webmcp({ include?: 'explicit' | 'all', prefix?, modelContext? })`. Publica ações para agentes do navegador via `document.modelContext` (origin trial do Chrome). Por padrão, só ações cujo `exposeTo` inclua `'agent'`. As chamadas passam pelo kernel: validação, interceptadores, confirmação e registro visível no histórico (rota `agent`).

## mcp-apps

Renderiza [MCP Apps](https://modelcontextprotocol.io) (recursos `ui://`, `text/html;profile=mcp-app`) que o seu backend, como cliente MCP, envia como `ui.render` com o componente `mcp-app` e as props `{ html, toolName?, input?, result?, csp? }`. O app roda num iframe com sandbox (`allow-scripts`, origem opaca) e CSP restritiva; o H4B é o host: `ui/initialize`, entrada e resultado da ferramenta depois do `initialized`, `tools/call` ligado às ações do H4B listadas em `allowTools` (origem `agent`, registrado no histórico), `ui/message` como entrada do usuário, `ui/open-link` (só http/https), `ui/update-model-context` como sinal de contexto, `size-changed`.

```ts
widget({ renderers: { 'mcp-app': mcpAppRenderer({ allowTools: ['filter_orders'] }) } })
// ou na sua própria UI: elemento.append(mountMcpApp(h4b, props, { allowTools }))
```

## storage-local

`storageLocal({ key?, ttlMinutes?: 30, area?: 'local' | 'session', maxMessages?: 200 })`. Restaura a conversa ao carregar; recomeça após inatividade. Blobs viram marcadores.

## tab-sync

`tabSync({ channel?, throttleMs? })`. Espelha a conversa entre abas; históricos da mesma conversa são mesclados por id de mensagem.

## testkit

Para quem escreve plugins e transportes: `scriptedTransport`, `reply`, `eventually`, `waitForIdle` e `transportConformance(nome, { create(cenário) })`, uma suíte Vitest (resposta em texto, ida e volta de ação, erro do backend, cancelamento) em que todos os transportes deste repositório passam.

## observability

`observability({ includeContent?: false, ...opçõesDoCreateObservability })`. Turnos, fases por rota, ações, sinais e estímulos como eventos semânticos, além da latência percebida por rota (`h4b_first_response_ms`, `h4b_turn_duration_ms`) para calibrar comandos diretos frente às respostas do LLM, para Grafana (Faro/OTel), Langfuse e LangSmith. Veja [`packages/semantic-event-observability`](../../packages/semantic-event-observability/README.md) e [`examples/OBSERVABILITY.md`](../../examples/OBSERVABILITY.md).
