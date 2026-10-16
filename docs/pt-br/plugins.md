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
| [`voice-models`](#voice-models) | `piperTTS`, `kokoroTTS`, `transformersTTS`, `espeakPhonemizer` (provedores) | — |
| [`voice-effects`](#voice-effects) | `voiceEffects`, presets, `toSSML`, `toFFmpeg` | — |
| [`keyboard`](#keyboard) | `keyboard` | — |
| [`inputs`](#inputs) | `camera`, `files`, `gui`, `sensors` | `camera`, `files`, `sensors` |
| [`guided`](#guided) | `guided` | `guided` |
| [`expose-webmcp`](#expose-webmcp) | `webmcp` | `webmcp` |
| [`mcp-apps`](#mcp-apps) | `mountMcpApp`, `mcpAppRenderer` | — |
| [`memory`](#memory) | `memory`, `httpSummarizer`, `localSummary`, `groupTurns` | `memory` |
| [`storage-local`](#storage-local) | `storageLocal`, `cookieKey`, `backendKey` | `storage`, `retention` |
| [`storage-backend`](#storage-backend) | `storageBackend` | `storage`, `retention` |
| [`tab-sync`](#tab-sync) | `tabSync` | — |
| [`consent`](#consent) | `redact`, presets, `loadConsentRules`, `regionFromMeta`, `regionFromUrl` | — |
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
  input?: { whileBusy?: 'interrupt' | 'queue' | 'merge' | { [modality]: … } | (signal) => … }, // o que a entrada faz com o assistente ocupado (veja Conceitos)
  memory?: { … } | false,    // veja memory
  consent?: { rules?, region?, initial?, manage?, channel? }, // veja Consentimento
})
await h4b.start()
```

API principal: `signal()`, `send()`, `ask()`, `runAction()`, `push()`, `interrupt()`, `setInput()`, `abort()`, `reset()`, `persist()`, `actions.register()`, `provide()/get()`, `on()/when()`, `intercept()`, `addMatcher()`, `capture()`, `subscribe()/getSnapshot()`, `use(plugin)`, `stop()`, `consent` (`state()`, `granted()`, `set()`, `setRegion()`, `ready()`, `snapshot()`, `subscribe()`). O `withConsent(plugin, finalidade | false)` condiciona um plugin a uma finalidade de consentimento, ou o deixa sempre livre. Guia: [Consentimento](./consent.md).

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

`widget({ container?, layout?: 'floating' | 'sidebar' | 'inline', corner?, startOpen?, alwaysOpen?, title?, botName?, botJob?, avatar?, language?, strings?, theme?: 'auto' | 'light' | 'dark', color?: 'blue' | 'purple' | 'orange' | 'green', colors?, greeting?, disclaimer?, pace?, showActions?, showPrivacy?, autofocus?, renderers? })`

Um Web Component (`<h4b-chat>`, shadow DOM) que funciona em qualquer página ou framework: Markdown seguro, imagens, respostas rápidas, cartões de ação identificados por origem, linha de status comum a todas as rotas, cadência entre mensagens do bot, sugestões do menu ao digitar, controles de microfone e alto-falante (com `voice`), uma mensagem que diz ao usuário por que a escuta falhou (textos `micDenied`, `speechServiceOff`, `micMissing`, `voiceNetwork`, `voiceFailed`, substituíveis em `strings`), botões de anexo e câmera (com `files` / `camera`), colar e arrastar. Estilize com variáveis CSS (`--h4b-primary`, `--h4b-bg`, `--h4b-radius`…) ou `::part()`. Adicione componentes para conteúdo rico com `renderers: { nome: (props) => HTMLElement }`; `gallery` já vem pronto.

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

`voice({ stt, tts?, language?, mode?: 'push-to-talk' | 'hands-free', output?: 'auto' | 'voice' | 'text', bargeIn?: true | { minWords?: 2, ignore? }, endOfTurn?, echo?: textEchoFilter() | EchoFilter | false, turn?: { silence?: 800, minSilence?: 300, maxSilence?: 2000, threshold?: 0.5, timeout?: 600, audioSeconds?: 8 }, voiceName?, load?: { start?: 'first-use' | 'eager' | 'idle' | 'manual', whileLoading?: 'fallback' | 'wait' | 'silent' }, effects?, player? })`. `stt`/`tts` recebem um provedor ou uma lista (testados em ordem, com troca em erro de rede ou suporte e quando o serviço de fala do navegador está desligado).

| Provedor | Observações |
|----------|-------------|
| `webSpeechSTT({ continuous? })`, `webSpeechTTS({ voice?, rate?, pitch? })` | APIs do navegador; textos longos são divididos em frases. O `webSpeechTTS` recebe só a prosódia dos efeitos |
| `httpSTT({ url, headers?, parse?, silenceMs? })`, `httpTTS({ url, headers?, body?, prosody?, playback?: 'webaudio' \| 'element' })` | Seu backend faz proxy para qualquer provedor em nuvem (chaves ficam no servidor); detecção simples de fala para mãos-livres. O `httpTTS` decodifica o áudio e toca pelos efeitos; `prosody: true` manda a prosódia no corpo para o seu backend aplicar |
| `websocketSTT({ url, sampleRate?, onOpen?, parse, finish?, endOfTurn? })` | Envia PCM 16 bits em streaming; `url` pode ser uma função que busca um token temporário. `endOfTurn: true` quando o serviço detecta o turno sozinho: `parse` devolve `{ final, endOfTurn }` |
| `voskSTT({ url })` | Servidor Vosk próprio |
| `voskBrowserSTT({ modelUrl, load: () => import('vosk-browser'), grammar? })` | Offline, no navegador (WebAssembly); o modelo é baixado uma vez e depois nenhum áudio sai do dispositivo. `preload()` adianta o download |

Serviço: `listen({ until? })`, `stop()`, `cancel()`, `endTurn()`, `discardTurn()`, `toggle()`, `setMode()`, `setOutput()`, `setEndOfTurn()`, `setEcho()`, `configure({ turn?, bargeIn? })`, `speak()`, `cancelSpeech()`, `loadSpeech(nome?)`, `setTTS(provedores)`, `setEffects(efeitos | null)`, `unlockAudio()`, `getState()` (`phase`, `listening`, `speaking`, `synthesizing`, `partial`, `endOfTurnAt`, `interrupted`, `lastInput`, `endOfTurn`, `echo`, `effects`, `ttsStatus`, `error`…), `subscribe()`.

- **Síntese de voz.** Provedores que devolvem áudio (`synthesize`: `httpTTS`, os modelos do `voice-models`) tocam pelo Web Audio com os efeitos, e a próxima frase é sintetizada enquanto a atual toca. `load` decide quando os modelos baixam (`start`) e quem fala enquanto isso (`whileLoading`); `ttsStatus` tem o `state` de cada provedor (`unloaded`, `loading`, `ready`, `failed`) e o progresso. O áudio é liberado no primeiro gesto na página. Guia: [Síntese de voz e efeitos](./speech.md).

- `stop()` encerra a escuta e ainda envia o que foi dito; `cancel()` encerra e descarta a fala (nada é enviado, nem uma transcrição final que o provedor entregue depois).
- No push-to-talk a fala termina na primeira pausa por padrão (bom para clicar e falar). `listen({ until: 'stop' })` é segurar para falar: o reconhecimento continua entre pausas (reiniciando se o navegador encerrar a sessão), `partial` mostra tudo o que foi dito até ali e uma única mensagem sai no `stop()`. O botão de microfone do widget e o atalho `talk` do teclado usam esse modo.
- `getState().error.code` é um destes: `not-supported`, `not-allowed` (o microfone foi negado), `service-not-allowed` (o microfone está liberado, mas o serviço de fala do navegador está desligado ou bloqueado, como o ditado desativado no Safari; o próximo provedor da lista é tentado), `no-speech`, `audio-capture`, `network`, `unknown`. Use-o para mostrar a ajuda certa ao usuário; o widget já faz isso. Todo erro de voz também vai para o evento `error` do kernel com `source: 'voice'` (`h4b.on('error', …)`), então logs e observabilidade o enxergam.
- Guia com exemplos, opções de provedores e ajustes: [Interrupção e conversa por voz](./conversation.md).
- **Conversa contínua (mãos-livres).** O microfone fica aberto; os resultados finais se acumulam num turno pendente (`partial` mostra tudo) e saem como uma mensagem quando o turno termina: depois de `turn.silence` de silêncio ou, com um provedor de fim de turno, assim que ele disser que a pessoa terminou (consultado depois de `minSilence`, aceito a partir de `threshold`, abandonado depois de `timeout`) e no máximo depois de `maxSilence`. Voltar a falar antes disso mantém o turno aberto. `endTurn()` envia agora (botão "enviar"), `discardTurn()` descarta e continua ouvindo (botão "lixeira"), `stop()` envia e fecha o microfone. Se o turno já saiu, o kernel junta a continuação a ele enquanto a resposta não começou (veja [Conceitos](./concepts.md#entrada-com-o-assistente-ocupado)).
- **Provedores de fim de turno** (`EndOfTurn`: `{ name, input: 'text' | 'audio', historyTurns?, remote?, consent?, isSupported(), load?(), predict({ partial, history, language, audio? }, signal) → probabilidade }`): `httpEndOfTurn({ url, headers?, parse?, historyTurns?, consent? })` consulta seu backend (um classificador como o turn-detector da LiveKit ou um BERT, um modelo de decisão tipada ou o seu LLM; as chaves ficam no servidor). Modelos locais (por exemplo o Smart Turn em ONNX) seguem o mesmo contrato. Modelos de áudio precisam de um reconhecedor que exponha o áudio (`capabilities.audio`: `websocketSTT`, `voskSTT`, `voskBrowserSTT`); o Web Speech não expõe, então use um modelo de texto com ele. Um reconhecedor que detecta o fim do turno sozinho (`capabilities.endOfTurn`, marcando os resultados com `endOfTurn`) substitui o modelo. Sem provedor, ou enquanto ele carrega, está sem consentimento, falha ou demora, o silêncio decide. Troque em runtime com `setEndOfTurn(provedor | null)`; cada consulta custa o que o seu provedor custa.
- **Barge-in.** Fala por cima do bot (falando, ou exibindo uma resposta que ainda chega) chama `h4b.interrupt()`: a fala para, a resposta é cancelada e a mensagem fica só com as frases já faladas. Uma transcrição parcial precisa de `minWords` palavras; um resultado final sempre conta. Backchannels ("aham", "tá", "ok"…, uma lista por idioma; troque com `ignore`) nunca interrompem e são descartados. Apertar para falar enquanto o bot responde também interrompe. Com `bargeIn: false`, o reconhecimento pausa enquanto o bot fala.
- **Filtro de eco** (`EchoFilter`: `{ name, tail?, filter({ text, final, speech, language }) → texto }`): descarta o que o microfone ouve da própria fala do bot, para ele não se interromper nem responder a si mesmo. Consultado em cada transcrição parcial e resultado final enquanto o bot fala e por `tail` ms depois. Padrão `textEchoFilter({ threshold?: 0.6, minRun?: 2, tail?: 2000 })`: compara palavras, tudo ou nada, uma palavra sozinha sempre passa. `echo: false` desliga; `setEcho(filtro | null)` em runtime. Detalhes: [Filtro de eco](./conversation.md#filtro-de-eco).
- As respostas são faladas frase a frase enquanto chegam, então a fala começa antes de a resposta terminar.
- `phase` é `idle`, `listening`, `userSpeaking`, `waitingEndOfTurn` (até `endOfTurnAt`) ou `botSpeaking`; `interrupted` fica `true` depois que a pessoa cortou a última resposta. Toda interrupção, backchannel ou eco ignorado e fim de turno é informado no evento `voice.decision`.
- Provedores dizem se o áudio ou o texto saem da página (`remote`; o `webSpeechSTT` conta como remoto, porque navegadores como o Chrome mandam o áudio para o serviço deles) e podem exigir uma finalidade de consentimento (`consent`, veja [Consentimento](./consent.md)): enquanto ela não está concedida, são pulados. Mostrar o aviso é do app. Provedores que abrem o microfone usam cancelamento de eco, supressão de ruído e ganho automático; o Web Speech cuida do próprio microfone.
- O `webSpeechSTT` se declara sem suporte fora de um contexto seguro (`http` simples), então `supported.stt` é `false` nesse caso, a não ser que outro provedor funcione.
- `webSpeechSTT({ continuous: 'auto' })` (padrão) usa o reconhecimento contínuo do navegador no segurar para falar e no mãos-livres, menos no Android, onde o Chrome repete o que já foi dito nesse modo: ali cada sessão ouve uma fala e o serviço de voz inicia a seguinte, então uma palavra dita bem na troca pode se perder. `continuous: true` força o modo contínuo do navegador e `false` o desliga em todos os aparelhos.

## voice-models

Provedores de fala que rodam modelos neurais na página. Entram em `voice({ tts })`; nada pesado é importado até um modelo carregar (passe `runtime: () => import('onnxruntime-web')`).

| Provedor | Opções |
|----------|--------|
| `piperTTS({ model, config, phonemizer, runtime, speaker?, noiseScale?, lengthScale?, noiseW?, sessionOptions?, cache?, size?, name? })` | Vozes do Piper (VITS). `piperVoice('pt_BR-faber-medium')` dá `{ model, config }` no Hugging Face. Velocidade pelo `length_scale` |
| `kokoroTTS({ model, tokenizer, voices, voice?, phonemizer, runtime, language?, sessionOptions?, cache?, size?, name? })` | Kokoro 82M. `kokoroModel({ dtype?: 'q8', voices, revision? })` dá os arquivos no Hugging Face. O idioma da voz segue a primeira letra (`p` → português do Brasil) |
| `transformersTTS({ name, pipeline, call?, prosody?, size? })` | Qualquer pipeline `text-to-speech` do transformers.js; `transformersProgress(onProgress)` adapta os eventos de progresso |
| `espeakPhonemizer({ module, wasm, data, voices?, cache?, size? })` | Texto para fonemas com espeak-ng (GPL-3.0, não incluído: você passa o build do piper-phonemize) |

Fontes (`ModelSource`): uma URL (absoluta ou relativa à página), `huggingFace(repo, arquivo, { revision?, endpoint? })`, um `Blob`, um `ArrayBuffer`/`Uint8Array` ou uma função assíncrona que devolve qualquer um deles. `fetchModel(fonte, { onProgress?, signal?, cache?, fetch? })` baixa com progresso e guarda o arquivo no Cache Storage (`h4b-voice-models`; `cache: false` desliga); `clearModelCache()` apaga. Guia: [Síntese de voz e efeitos](./speech.md).

## voice-effects

`voiceEffects(cadeia | preset = 'clean', { effects? })` → uma cadeia de efeitos viva para `voice({ effects })`: `get()`, `set(cadeia | preset)`, `update(índice | id, patch)`, `setProsody(prosódia)`, `subscribe()`, `definitions()`, `render(áudio)`.

- Uma cadeia é JSON: `{ version: 1, name?, description?, prosody?: { rate?, pitch?, volume? }, effects: [{ type, id?, bypass?, ...parâmetros }] }`. Tipos e nomes de parâmetros seguem o Web Audio; os descritores de parâmetros seguem os Web Audio Modules; a prosódia usa as unidades do SSML (semitons, dB).
- Tipos de efeito: `highpass`, `lowpass`, `bandpass`, `peaking`, `lowshelf`, `highshelf`, `notch`, `allpass`, `gain`, `compressor`, `limiter`, `gate`, `varispeed`, `vibrato`, `tremolo`, `chorus`, `delay`, `reverb`, `distortion`, `ringmod`, `dispersion`. Acrescente os seus com `defineEffect({ type, label, params, process?, build?, tail?, speed?, ffmpeg? })`.
- Presets (`presets`): `clean`, `denoise`, `radio`, `telephone`, `megaphone`, `robot`, `underwater`, `cave`, `ice`, `chipmunk`, `giant`.
- `validateChain(cadeia)` lista todos os problemas; `chainSchema()` é o JSON Schema; `fx.render(áudio)` renderiza offline (com as caudas).
- Pontes: `toSSML(texto, prosódia, { language?, voice?, pitch?: 'st' | '%', fragment? })` e `toFFmpeg(cadeia | preset, { sampleRate?, prosody? })` → `{ filter, warnings, command(entrada, saída) }`.
- O pacote só precisa do `@handsforbots/voice` para tipos: cadeias, SSML e exportação para FFmpeg funcionam também fora do H4B (um script de build, um servidor).

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

## memory

Montado pelo `createH4B` por padrão; `createH4B({ memory: { … } })` ajusta, `memory: false` desliga, e um `memory(...)` em `plugins` o substitui.

`memory({ send?: 20 | 'all' | 'none', keep?: 100 | 'all', compact?: 'local' | false | Summarizer, maxSummaryChars?: 4000 })`. Conta **turnos** (um job do kernel: uma mensagem do usuário e a resposta, um `runAction`, um `push`; as mensagens levam `turnId`). Envia os últimos `send` turnos e resume os anteriores no sinal de contexto `memory.summary` (`'local'` sem LLM, ou `httpSummarizer({ url })` → o seu backend recebe `{ previous, messages }` e responde `{ summary }`); guarda os últimos `keep` turnos no histórico, removendo só o que já está no resumo. Serviço `memory`: `options`, `summary`, `view(request)`, `maintain()`; evento `memory.changed`. Guia: [Persistência, memória e privacidade](./persistence.md).

## storage-local

Guarda a conversa no navegador. **Criptografada por padrão** (AES-GCM): a chave fica fora do dado guardado e expira, então depois do prazo não sobra nada legível, mesmo que a pessoa nunca volte ao site.

```ts
storageLocal() // chave num cookie que expira após 30 min sem uso
storageLocal({ keySource: cookieKey({ ttlMinutes: 15, path: '/app' }) })
storageLocal({ keySource: backendKey({ url: '/api/h4b/key' }) }) // o seu servidor guarda a chave e decide quando ela expira
storageLocal({ retention: 'tab', userChoices: ['key', { ttlMinutes: 5 }] })
```

| Opção | Padrão | |
|---|---|---|
| `encrypt` | `true` | `false` guarda JSON legível (e descarta sobras criptografadas) |
| `keySource` | `cookieKey()` | `cookieKey({ ttlMinutes: 30, name: 'h4b-key', path: '/', domain?, sameSite: 'Strict' })` ou `backendKey({ url, ttlMinutes?, headers?, credentials: 'same-origin', fetch? })` |
| `retention` | `'key'` | `'key'` (até a chave expirar), `{ ttlMinutes }` (também apaga após esse tempo sem atividade), `'tab'` (sessionStorage, some ao fechar a aba) |
| `userChoices` | `[]` | Retenções que quem usa o site pode escolher; o widget as mostra |
| `key` | `'h4b:conversation'` | |

- A chave no cookie é renovada a cada carregamento e gravação (`Max-Age`, `SameSite=Strict`, `Secure` em https). Ela é legível pelos scripts da página e vai junto nas requisições ao `path` (uns 60 bytes).
- Protocolo do `backendKey`: `GET url` → `200 { "key": "<base64url, 32 bytes>" }` (renovando) ou `404`; `POST url` → `200` com a chave existente ou uma nova. O servidor reconhece o usuário pela própria sessão (cookie HttpOnly, enviado com `credentials: 'same-origin'`). A chave é buscada a cada carregamento e gravação e fica só em memória.
- Sem chave, o dado não pode ser lido: ele é apagado no próximo carregamento ou pela varredura que roda a cada minuto. Se não houver fonte de chave (sem Web Crypto, cookies bloqueados), nada é salvo e o `save()` reporta um `error` com origem `storage`.
- Blobs viram marcadores.
- **Não protege contra XSS:** um script injetado na página consegue ler a chave. Isto limita o tempo em que a conversa fica legível no navegador.
- Exige a finalidade de consentimento `persistence` quando o `createH4B` tem `consent`: nada (nem o cookie da chave) é gravado antes de ela ser concedida; ao revogar, a conversa, a escolha de retenção e a chave são apagadas (o `backendKey` recebe `DELETE url`). Veja [Consentimento](./consent.md).

## storage-backend

Guarda a conversa no seu servidor.

```ts
storageBackend({ url: '/api/h4b/conversation', retention: 'server', userChoices: [{ ttlMinutes: 30 }, 'tab'] })
```

`GET url` carrega (`200` com o snapshot, ou `204`/`404`), `PUT url` salva o snapshot (JSON, Blobs viram marcadores), `DELETE url` apaga. Toda requisição leva `X-H4B-Conversation` (um id aleatório guardado no localStorage, ou no sessionStorage com `'tab'`, para que uma aba fechada não o alcance mais) e `X-H4B-Retention` (`server`, `tab` ou o TTL em minutos); o seu servidor aplica a retenção. Quem tem o id consegue ler a conversa: vincule-o à sessão do usuário quando houver uma. Opções: `url`, `retention` (`'server'`), `userChoices`, `headers`, `credentials` (`'same-origin'`), `fetch`, `idKey`.

Com `createH4B({ consent })`, exige `persistence`, envia as finalidades concedidas em `X-H4B-Consent` (por exemplo `persistence,review`) e salva de novo quando elas mudam; ao revogar, envia `DELETE` e esquece o id. Veja [Consentimento](./consent.md).

## Retenção

Os dois storages fornecem o serviço `retention` (`RetentionControl` no `core`): `current`, `choices` (o padrão do desenvolvedor seguido de `userChoices`), `location` (`'browser'` ou `'server'`), `encrypted`, `keyTtlMinutes`, `set(retenção)` (move o que está guardado e lembra a escolha neste navegador, para todas as abas) e `subscribe`. O widget mostra um botão 🔒 com onde a conversa fica, as escolhas e *Apagar a conversa agora* (`widget({ showPrivacy: false })` esconde).

## tab-sync

`tabSync({ mode?: 'sync', channel?, throttleMs?, context? })`.

| `mode` | Comportamento |
|---|---|
| `sync` (padrão) | As abas compartilham uma conversa; históricos da mesma conversa são mesclados por id de mensagem, uma conversa diferente substitui |
| `notify` | Cada aba tem a sua conversa; as outras recebem o evento `tabs.activity` (`{ kind: 'action', name, origin, ok, error? }`, `{ kind: 'turn', phase, route }` para turnos do assistente, `{ kind: 'reset' }`, mais `tab` e `at`) e um sinal de contexto `tab-sync.activity` com as últimas `context.limit` (10) atividades, para o assistente saber; `context: false` deixa só o evento |
| `off` | Abas isoladas: nada é transmitido |

Com `notify` ou `off`, use a retenção `'tab'`: senão abas que gravam na mesma chave do localStorage (ou no mesmo id do backend) sobrescrevem a conversa uma da outra.

O `tab-sync` não depende de consentimento: ele não guarda nada, só compartilha a conversa em memória entre as abas abertas.

## consent

Conjuntos de regras e utilitários para o `createH4B({ consent })` (o mecanismo em si fica no `core`). Guia: [Consentimento](./consent.md).

- `lgpd`, `gdpr`, `ccpa`, `optIn` e `presets` (os quatro): pontos de partida com as finalidades `persistence`, `review` e `analytics`; também em `@handsforbots/consent/rules/*.json`.
- `loadConsentRules(url, { parse?, fetch? })`: busca um conjunto ou uma lista (JSON, ou YAML com `parse: YAML.parse`) e valida.
- `regionFromMeta(name = 'h4b-region')`, `regionFromUrl(url)`: a região de quem visita, pela página ou por um endpoint seu.
- `redact({ patterns?, custom?, replace?, media?: 'omit' | 'keep', hooks?: ['storage.before'], when? })`: anonimiza e-mails, telefones, CPF, CNPJ e números de cartão (e mídia) no que é guardado, opcionalmente só enquanto uma finalidade (por exemplo `review`) estiver concedida. Também `redactText`, `redactMessages`, `redactor`, `PATTERNS`.

## testkit

Para quem escreve plugins e transportes: `scriptedTransport`, `reply`, `eventually`, `waitForIdle` e `transportConformance(nome, { create(cenário) })`, uma suíte Vitest (resposta em texto, ida e volta de ação, erro do backend, cancelamento) em que todos os transportes deste repositório passam.

## observability

`observability({ includeContent?: false, ...opçõesDoCreateObservability })`. Turnos, fases por rota, ações, sinais e estímulos como eventos semânticos, além da latência percebida por rota (`h4b_first_response_ms`, `h4b_turn_duration_ms`) para calibrar comandos diretos frente às respostas do LLM, para Grafana (Faro/OTel), Langfuse e LangSmith. Veja [`packages/semantic-event-observability`](../../packages/semantic-event-observability/README.md) e [`examples/OBSERVABILITY.md`](../../examples/OBSERVABILITY.md).
