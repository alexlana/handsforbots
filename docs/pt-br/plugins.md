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
| [`voice-models`](#voice-models) | `piperTTS`, `kokoroTTS`, `transformersTTS`, `workerTTS`, `espeakPhonemizer` (provedores) | — |
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

Fontes e citações ([guia](./sources.md)): `sourceView`, `sourceGroups`, `sourcesOf`, `citedSources`, `citationSegments`, `validCitations`, `isCitation`, `safeSourceUrl`, `toSourcePart`, `inlineCitations` / `stripInlineCitations` (marcadores como `[c3]` → citações, para backends e transportes) e `utf8OffsetToIndex`.

## transport-agui

`agui({ url, headers?, agent?, forwardedProps? })`: HTTP POST + SSE. `headers` pode ser uma função (renovar tokens, cabeçalhos de trace). `agent` aceita qualquer agente AG-UI (ex.: `new HttpAgent()` de `@ag-ui/client`, ou um local). Eventos CUSTOM `h4b.ui.effect` e `h4b.ui.render` viram efeitos na GUI e conteúdo rico; `h4b.sources` (`{ messageId?, sources: [...] }`) e `h4b.citations` (`{ messageId?, citations }`) viram [fontes e citações](./sources.md). As fontes não voltam no histórico.

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

- `http({ url, method?, headers?, session?, body?, parse?, parseChunk?, sendToolResults? })`: API genérica de turnos. `session: { url, method, extract }` abre uma sessão no backend por conversa (com o id da conversa como reserva). Respostas: texto puro, `{ response | content | text | message }`, listas de mensagens (`text`, `image`, `buttons`), chat completions, `tool_calls`; `text/event-stream` é lido em streaming (deltas no estilo OpenAI, tool calls fragmentadas). `sources` e `citations` numa resposta ou num chunk SSE viram [fontes e citações](./sources.md).
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

Data parts `data-ui-effect`, `data-ui-render` e `data-state` viram efeitos na GUI, conteúdo rico e estado compartilhado. Partes `source-url` e `source-document` viram [fontes](./sources.md) (o documento como referência só texto) e `data-citations` (`{ citations }`) vira citações.

## widget

`widget({ container?, layout?: 'floating' | 'sidebar' | 'inline', corner?, startOpen?, alwaysOpen?, title?, botName?, botJob?, avatar?, language?, strings?, theme?: 'auto' | 'light' | 'dark', color?: 'blue' | 'purple' | 'orange' | 'green', colors?, greeting?: string | string[] | { random: (string | string[] | { text, attributes? })[], experiment? }, disclaimer?, pace?, showActions?, showPrivacy?, autofocus?: boolean | { onLoad?: boolean, onClick?: boolean }, renderers?, sources?: { hosts?, action?, consulted? } | false })`

Um Web Component (`<h4b-chat>`, shadow DOM) que funciona em qualquer página ou framework: Markdown seguro, imagens, respostas rápidas, cartões de ação identificados por origem, linha de status comum a todas as rotas, cadência entre mensagens do bot, sugestões do menu ao digitar, controles de microfone e alto-falante (com `voice`), uma mensagem que diz ao usuário por que a escuta falhou e por que a voz do bot não saiu (textos `micDenied`, `speechServiceOff`, `micMissing`, `voiceNetwork`, `voiceFailed`, `voiceOutputBlocked`, `voiceSpeakFailed`, substituíveis em `strings`), botões de anexo e câmera (com `files` / `camera`), colar e arrastar. Estilize com variáveis CSS (`--h4b-primary`, `--h4b-bg`, `--h4b-radius`…) ou `::part()`. Adicione componentes para conteúdo rico com `renderers: { nome: (props) => HTMLElement }`; `gallery` já vem pronto. As fontes de uma resposta aparecem como referências numeradas e uma lista (citadas, depois consultadas); `sources.action` roda uma ação registrada em vez de seguir o link ([Fontes e citações](./sources.md#widget)).

`greeting` é mostrado e gravado no histórico quando a conversa está vazia. Uma string é uma mensagem; um array são várias mensagens em ordem. Para começar cada conversa nova de um jeito diferente, use `{ random: [...] }`: o widget sorteia uma opção, e cada opção é uma string ou um array de mensagens. A opção mostrada por último não é sorteada de novo no mesmo navegador (o índice fica no `localStorage`, na chave `h4b-widget-greeting`; sem storage, qualquer opção pode sair). Nada é sorteado nem mostrado se a conversa já tiver mensagens quando o widget monta. `pickGreeting(greeting, previous?, random?)` faz o mesmo sorteio para uma interface que você desenha. Para um teste A/B, uma opção pode ser `{ text, attributes }`: o widget põe os atributos da opção sorteada na conversa e registra uma exposição; com `consent`, o último índice só vai para o `localStorage` com `persistence` ([Experimentos](./experiments.md#o-cumprimento-como-experimento)).

```ts
widget({
  greeting: {
    random: [
      'Oi! Como posso ajudar?',
      ['Que bom te ver de novo.', 'Pergunte o que quiser sobre esta página.'],
      'Olá! Procurando alguma coisa?',
    ],
  },
})
```

`autofocus` foca o compositor. Cada comportamento é um interruptor. `true` ou `{ onLoad: true }` foca quando a janela abre, inclusive numa página que carrega com a janela já aberta. `{ onClick: true }` foca quando a pessoa clica em qualquer lugar da página que seja um ponto livre: o texto das mensagens, um espaço vazio, a página em volta do chat. Cliques em botões, links, outros campos e seleções de texto continuam fazendo o que já faziam. Com a janela fechada, o clique não a abre. No celular, o foco ao carregar costuma ser ignorado até o primeiro toque.

Para um campo que você mesmo desenha, marque-o e ligue os mesmos interruptores. `bindTextFocus` devolve uma função que tira o listener do clique:

```html
<input data-h4b-text>
```

```ts
import { bindTextFocus } from '@handsforbots/widget'

const parar = bindTextFocus({ onLoad: true, onClick: false })
```

`input` aceita o elemento, um seletor CSS (`'#composer'`) ou uma função que devolve o elemento. Sem `input`, o primeiro `[data-h4b-text]` da página é o campo. `within` limita os cliques a um elemento (ou a um seletor); o padrão é o documento inteiro. Um campo escondido ou desabilitado fica quieto.

## react

`<H4BProvider value={h4b}>`, `useH4B()`, `useH4BState(selector)`, `useMessages()`, `useTurn()`, `useBusy()`, `useSharedState()`, `useAction(definição)` (registrada enquanto o componente existe, sempre chama o handler mais recente), `useContextSignal(key, valor)`, `useH4BEvent(nome, listener)`, `useStimulus(listener)`, `useStore(serviço)` (para serviços com estado, como `voice`), `useSources(mensagem)` ([fontes](./sources.md) separadas do texto), `useTextFocus(ref, { onLoad?, onClick?, within? })`.

`useTextFocus` é o mesmo par de interruptores para um campo que você renderiza. O ref diz qual elemento é o campo. `onLoad` foca depois da montagem, que é também o momento da prop `autoFocus` do React, e o hook roda de novo se você ligar esse interruptor mais tarde. `onClick` foca num clique em qualquer ponto livre. O hook não precisa de `H4BProvider`.

```tsx
const campo = useRef<HTMLInputElement>(null)
useTextFocus(campo, { onLoad: true, onClick: true })
return <input ref={campo} />
```

## vue

`app.use(h4bVue(h4b))` (ou `provideH4B(h4b)` num componente), `useH4B()`, `useH4BState(seletor)`, `useMessages()`, `useTurn()`, `useBusy()`, `useSharedState()`, `useAction(definição)`, `useContextSignal(key, refOuGetter)`, `useH4BEvent(nome, listener)`, `useStimulus(listener)`, `useService(chave)` (acompanha o serviço sendo fornecido ou removido depois), `useStore(refOuGetter)`, `useSources(refOuGetter)` ([fontes](./sources.md) separadas do texto, como computed ref), `useTextFocus(refOuGetter, { onLoad?, onClick?, within? })`, `v-text-focus`. O estado volta como shallow refs somente leitura que só disparam quando o valor selecionado muda; os registros acabam junto com o componente (ou `effectScope`).

`v-text-focus` nomeia o campo: o elemento em que ela está é o compositor. O `h4bVue` registra a diretiva (`vTextFocus` é a mesma diretiva, para um import local). `v-text-focus="true"` é o interruptor de carregar. `v-text-focus="{ onLoad: true, onClick: false }"` liga cada um. O atributo `autofocus` do navegador é esse interruptor de carregar aplicado uma vez, sem o comportamento de clique. `useTextFocus` recebe um template ref quando a diretiva fica desajeitada.

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

`voice({ stt, tts?, language?, mode?: 'push-to-talk' | 'hands-free', output?: 'auto' | 'voice' | 'text', bargeIn?: true | { minWords?: 2, ignore? }, endOfTurn?, echo?: textEchoFilter() | EchoFilter | false, turn?: { silence?: 800, minSilence?: 300, maxSilence?: 2000, threshold?: 0.5, timeout?: 600, audioSeconds?: 8 }, voiceName?, load?: { start?: 'first-use' | 'eager' | 'idle' | 'manual', whileLoading?: 'fallback' | 'wait' | 'silent' }, effects?, player?, reactions?: true })`. Com `reactions`, os backchannels ouvidos por cima do bot vão ao backend no turno seguinte como `voice.reactions` ([Interrupção e conversa por voz](./conversation.md#barge-in)). `stt`/`tts` recebem um provedor ou uma lista (testados em ordem, com troca em erro de rede ou suporte e quando o serviço de fala do navegador está desligado).

| Provedor | Observações |
|----------|-------------|
| `webSpeechSTT({ continuous? })`, `webSpeechTTS({ voice?, rate?, pitch?, startTimeout? })` | APIs do navegador; textos longos são divididos em frases. O `webSpeechTTS` recebe só a prosódia dos efeitos |
| `httpSTT({ url, headers?, parse?, silenceMs? })`, `httpTTS({ url, headers?, body?, prosody?, playback?: 'webaudio' \| 'element' })` | Seu backend faz proxy para qualquer provedor em nuvem (chaves ficam no servidor); detecção simples de fala para mãos-livres. O `httpTTS` decodifica o áudio e toca pelos efeitos; `prosody: true` manda a prosódia no corpo para o seu backend aplicar |
| `websocketSTT({ url, sampleRate?, onOpen?, parse, finish?, endOfTurn? })` | Envia PCM 16 bits em streaming; `url` pode ser uma função que busca um token temporário. `endOfTurn: true` quando o serviço detecta o turno sozinho: `parse` devolve `{ final, endOfTurn }` |
| `voskSTT({ url })` | Servidor Vosk próprio |
| `voskBrowserSTT({ modelUrl, load: () => import('vosk-browser'), grammar? })` | Offline, no navegador (WebAssembly); o modelo é baixado uma vez e depois nenhum áudio sai do dispositivo. `preload()` adianta o download |

Serviço: `listen({ until? })`, `stop()`, `cancel()`, `endTurn()`, `discardTurn()`, `toggle()`, `setMode()`, `setOutput()`, `setEndOfTurn()`, `setEcho()`, `configure({ turn?, bargeIn? })`, `speak()`, `cancelSpeech()`, `loadSpeech(nome?)`, `setTTS(provedores)`, `setEffects(efeitos | null)`, `unlockAudio()`, `willSpeakReplies()` (se uma resposta que chegasse agora seria falada), `getState()` (`phase`, `listening`, `speaking`, `synthesizing`, `partial`, `pauseSince`, `endOfTurnAt`, `endOfTurnCheckAt`, `interrupted`, `lastInput`, `endOfTurn`, `echo`, `effects`, `ttsStatus`, `error`…), `subscribe()`.

- **Síntese de voz.** Provedores que devolvem áudio (`synthesize`: `httpTTS`, os modelos do `voice-models`) tocam pelo Web Audio com os efeitos, e a próxima frase é sintetizada enquanto a atual toca. `load` decide quando os modelos baixam (`start`) e quem fala enquanto isso (`whileLoading`); `ttsStatus` tem o `state` de cada provedor (`unloaded`, `loading`, `ready`, `failed`) e o progresso. O áudio é liberado no primeiro gesto na página. Guia: [Síntese de voz e efeitos](./speech.md).

- `stop()` encerra a escuta e ainda envia o que foi dito; `cancel()` encerra e descarta a fala (nada é enviado, nem uma transcrição final que o provedor entregue depois).
- No push-to-talk a fala termina na primeira pausa por padrão (bom para clicar e falar). `listen({ until: 'stop' })` é segurar para falar: o reconhecimento continua entre pausas (reiniciando se o navegador encerrar a sessão), `partial` mostra tudo o que foi dito até ali e uma única mensagem sai no `stop()`. O botão de microfone do widget e o atalho `talk` do teclado usam esse modo.
- `getState().error.code` é um destes: `not-supported`, `not-allowed` (o microfone foi negado), `service-not-allowed` (o microfone está liberado, mas o serviço de fala do navegador está desligado ou bloqueado, como o ditado desativado no Safari; o próximo provedor da lista é tentado), `no-speech`, `audio-capture`, `network`, `output-blocked` (o navegador bloqueou a voz do bot até a pessoa interagir), `synthesis-failed` (a voz do bot falhou ou nunca começou), `unknown`. `getState().error.stage` diz onde falhou: `listen` (ouvindo a pessoa) ou `speak` (falando a resposta). Confira o `stage` antes de culpar o microfone: um erro na fala nunca é "não consegui ouvir". Use os dois para mostrar a ajuda certa ao usuário; o widget já faz isso. Todo erro de voz também vai para o evento `error` do kernel (`h4b.on('error', …)`) com `source: 'voice'`, ou `voice:tts:<provedor>` durante a fala, então logs e observabilidade o enxergam.
- `voice.speech` informa cada trecho falado: `{ phase: 'start', provider, chars }`, depois `{ phase: 'end', provider, ms, interrupted? }` ou `{ phase: 'error', provider, code, message }`. Um `start` sem nada depois quer dizer que a voz ficou muda. Trechos de uma resposta também levam `messageId`, `from` e `to` (posições UTF-16 no texto da resposta), e um trecho de resposta que nunca foi falado termina como `{ phase: 'skip', reason: 'no-provider' | 'cancelled' }`. Trechos do `speak(texto)` não têm posição.
- `voice.track` (`{ messageId, speak }`) diz, quando o texto de uma resposta começa a chegar, se ela vai ser falada. Use com o `voice.speech` para sincronizar a página com a fala em vez de adivinhar um atraso (o plugin `cues` faz isso).
- `voice.tts` informa o modelo e o funcionamento interno de cada provedor de fala, `{ provider, event, ... }`, sem conteúdo: `load.start` (`size`), `load.progress` (a cada quarto do download), `load.done` (`ms`), `load.error` (`message`), `load.aborted`, e `speech.while-loading` quando um trecho é pedido antes de o modelo ficar pronto (`policy`: o `whileLoading` em vigor; `action`: `fallback` com `to`, `wait` ou `silent`). Provedores com `trace(listener)` acrescentam os próprios passos (`workerTTS`: a vida do Worker e cada pedido, abaixo).
- Quando o último provedor falha numa frase, o evento `error` dispara uma vez, com `source: 'voice:tts:<provedor>'`.
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
| `workerTTS({ worker, config?, name?, size?, prosody? })` + `serveTTS(provedor \| (config) => provedor)` | Roda qualquer provedor com `synthesize` num Web Worker, e a síntese nunca congela a página. O `serveTTS` vai no arquivo do Worker; o `workerTTS` devolve o provedor para a página (`terminate()` para o Worker). Os pedidos esperam o Worker avisar que está ouvindo (`ready`), e a configuração é reenviada nessa hora, então um navegador que perde as primeiras mensagens enviadas a um Worker de módulo ainda carregando recebe a configuração mesmo assim. `trace(listener)` informa cada passo com um número por Worker (`worker.created`, `worker.init` com `attempt`, `worker.ready`, `worker.info` com `inits`, `request`, `reply`, `request.error`, `request.aborted`, `reply.stale`, `worker.error`, `worker.terminated`); o `voice` emite esses passos como `voice.tts`. [Guia](./speech.md#rodando-o-modelo-num-worker) |

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

## cues

`cues({ channels, rules?, classify?, report?: false, action?: true, sync?: 'speech' })`. Deixas são categorias de apresentação com vocabulário fechado a que a página reage: o humor de um personagem, o cenário, a urgência de um atendimento, o modo da conversa (ADR 0018). Cada canal declara seus valores (códigos, `[A-Za-z0-9_.:-]{1,64}`), um `default`, `persist` (`'message'`, o padrão, volta ao `default` numa mensagem sem valor; `'sticky'` mantém o anterior) e, opcionalmente, uma política `repeat` por valor. O rótulo exibido e o que cada valor faz são seus.

```ts
cues({
  channels: {
    tom: {
      values: ['neutro', 'curioso', 'contente', 'empolgado', 'confuso', 'serio', 'ofendido'],
      default: 'neutro',
      repeat: {
        confuso: { levels: [2, 4] },                        // nível 2 a partir do 2º seguido, 3 a partir do 4º
        ofendido: { max: 1, by: 'count', then: 'serio' },  // avisa uma vez por conversa
      },
    },
    cenario: { values: ['dia', 'noite', 'oficina'], default: 'dia', persist: 'sticky' },
  },
  classify: (fonte) => (fonte.url?.includes('/projetos/') ? ['projetos'] : []),
  rules: [
    { when: { taxonomy: 'projetos' }, set: { tom: 'empolgado' } },
    { when: { event: 'action.failed' }, set: { tom: 'confuso' } },
  ],
  report: true,
})
```

Os valores vêm de três lugares, todos validados: um valor fora da lista vira o `default` e um canal desconhecido é descartado, os dois com `error` (`source: 'cues'`).

- **Estímulo do backend**: `ui.effect` com `name: 'cues'` e `{ tom: 'curioso' }` ou `{ tom: { value: 'confuso', level: 3 } }`, mais um `messageId` opcional. Sem ele, o valor vai para a próxima resposta com texto do turno. Aparece na hora, com `pending: true`, e é guardado quando a mensagem termina; nomear uma mensagem já guardada a decide de novo.
- **Ação `set_cues`**: para backends que só usam tool calling. O JSON Schema tem um `enum` por canal (com a `description` do canal); roda para as origens `assistant` e `agent` sem confirmação e devolve o estado aplicado. `action: false` a deixa de fora; uma string a renomeia.
- **Regras**: `{ when, set, priority? }`, rodadas quando uma mensagem do assistente termina. O `when` é uma função de `{ message, text, sources, taxonomies, actions, errors, interrupted, trigger }` ou um objeto em que todas as chaves precisam bater: `source` (`urlPrefix`, `trail`, `title`, `taxonomy`), `taxonomy` (vinda do `classify(fonte)`), `action`, `event` (`error`, `action.failed`, `interrupted`), `trigger` (a modalidade que abriu o turno) e `text` (uma RegExp).

Precedência por canal e mensagem: backend, depois regras (maior `priority`; no empate, a última declarada), depois `sticky` ou `default`. A política de repetição vem por último. `levels` sobe o nível conforme o valor se repete (`by: 'streak'`, o padrão, conta mensagens seguidas; `'count'`, a conversa inteira); um nível mandado pelo backend fica dentro da faixa declarada. `max` limita quantas vezes o valor vale: passado o limite, ele vira `then` (ou o `default`), guardado com `from: 'repeat'` e `requested`. A H4B só aplica a política ao que a página mostra; o que o assistente diz continua sendo do backend, então ligue o `report` junto com `max`: toda requisição leva o sinal de contexto `cues.state` (`{ tom: { value, streak, count, level, requested? } }`).

Com `voice`, uma resposta que vai ser falada (`voice.track`) mostra as deixas quando o primeiro trecho dela começa a tocar (`voice.speech` com o `messageId` dela), e não quando chega: o personagem muda quando a voz chega naquela resposta, depois do que ainda estava tocando, sem atraso fixo. Também mostra se esse trecho falhar ou for pulado, e no `h4b.interrupt()`. Respostas que não são faladas mostram na chegada, e tudo mostra na chegada com `sync: 'arrival'`. Até lá o `getState()` mantém o estado anterior; o `report` e o resultado do `set_cues` já levam o que foi decidido. Respostas sem texto (só chamadas de ferramenta) não recebem deixas. Cada resposta guarda o que foi decidido numa parte `data` chamada `cues` (`{ tom: { value, level, from, requested? } }`). Por isso o storage, a restauração e o `tab-sync` trazem o estado de volta e as contagens são refeitas a partir do histórico; as regras nunca rodam de novo sobre mensagens antigas, e o `reset()` volta aos padrões. Transportes que mandam partes `data` ao backend mandam essa também.

O serviço `cues` tem `getState()` (por canal: `value`, `previous`, `streak`, `count`, `level`, `from`, `requested?`, `messageId?`, `pending?`), `subscribe()`, `channels` e `schema()`. Eventos: `cue.changed` (`{ channel, ...estado }`, quando algo mudou) e `cue.repeat` (`{ channel, value, level, streak, count, replaced?, messageId }`, quando um nível é alcançado ou um valor é trocado). No React, `useStore(useH4B().get('cues'))`; no Vue, `useStore(useService('cues'))`. O widget espelha cada canal em `data-cue-<canal>` e `data-cue-<canal>-level` no `<h4b-chat>`, para o CSS:

```css
h4b-chat[data-cue-tom='confuso'][data-cue-tom-level='3'] .avatar { animation: tremer 0.6s; }
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

Para quem escreve plugins e transportes: `scriptedTransport`, `reply`, `citedReply` (fontes, texto limpo e citações, como um backend com RAG), `eventually`, `waitForIdle` e `transportConformance(nome, { create(cenário) })`, uma suíte Vitest (resposta em texto, ida e volta de ação, erro do backend, cancelamento) em que todos os transportes deste repositório passam.

## observability

`observability({ includeContent?: false, ...opçõesDoCreateObservability })`. Turnos, fases por rota, ações, sinais e estímulos como eventos semânticos, além da latência percebida por rota (`h4b_first_response_ms`, `h4b_turn_duration_ms`) para calibrar comandos diretos frente às respostas do LLM, para Grafana (Faro/OTel), Langfuse e LangSmith. Com `voice`, também registra cada trecho falado (`voice.speech.start`, `.end`, `.error`), `voice.decision` (transcrições só com `includeContent`) e cada evento `voice.tts` como `voice.tts.<evento>` (carga do modelo, fala durante a carga, vida do Worker de fala); os erros levam `code` e `stage`. Com `cues`, registra `cue.changed` e `cue.repeat` (só códigos). Registra o navegador no início (`client.environment`: `userAgent`, `language`). Os atributos da conversa vão em todo span e, pelo `getTraceHeaders()`, ao seu backend como W3C `baggage`; exposições e o primeiro turno do visitante em cada conversa viram `experiment.exposed` e os contadores `h4b_experiment_exposed_total` e `h4b_conversation_engaged_total`, inclusive exposições de antes do `analytics` ser concedido. `@handsforbots/observability/server` lê o cabeçalho no seu backend ([Experimentos](./experiments.md)).

Para depurar no celular, sem devtools: adicione o exporter `devPanel` (`observability({ exporters: ['memory', 'devPanel'] })`) e ligue-o naquele navegador com `localStorage.setItem('semantic-event-observability:debug', 'true')`, depois recarregue. Um painel flutuante lista os eventos recentes, e o botão de exportar baixa esses eventos junto com o navegador (`environment`: user agent, idioma, plataforma, tamanho da tela). Veja [`packages/semantic-event-observability`](../../packages/semantic-event-observability/README.md) e [`examples/OBSERVABILITY.md`](../../examples/OBSERVABILITY.md).
