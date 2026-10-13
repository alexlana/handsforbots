# Interrupção e conversa por voz

Como o Hands for Bots trata uma mensagem que chega enquanto o assistente ainda responde, e como o plugin de voz conduz uma conversa contínua: microfone aberto, detecção de fim de turno e barge-in. Registro da decisão: [ADR 0011](../adr/0011-interrupcao-e-fim-de-turno.md). Fontes: [Referências](./references.md).

## Entrada com o assistente ocupado

Os turnos rodam um por vez. O que uma mensagem digitada ou falada faz quando chega com um turno rodando é a **política de entrada**, `whileBusy`:

| Política | A mensagem nova… | A resposta em andamento… |
|---|---|---|
| `interrupt` (padrão) | vira o próximo turno | para; fica com o que foi exibido, marcada com `interrupted: true` |
| `merge` | junta-se a uma mensagem ainda não respondida, ou espera | continua |
| `queue` | espera tudo o que veio antes | continua |

Com `interrupt` e `merge`, um turno que **ainda não produziu nada** é retomado: é abortado, a mensagem do usuário sai do histórico e ele roda de novo com as duas entradas numa mensagem só. Mensagens enviadas em sequência rápida são unidas do mesmo jeito, então o backend recebe uma chamada em vez de várias. Mensagens digitadas são unidas com quebra de linha; fala, com espaço.

```ts
const h4b = createH4B({ plugins, input: { whileBusy: 'interrupt' } })

h4b.setInput({ whileBusy: 'queue' })                                   // em runtime, ex.: de uma tela de configurações
h4b.setInput({ whileBusy: { text: 'merge', transcript: 'interrupt' } }) // por modalidade; as ausentes usam 'interrupt'
h4b.setInput({ whileBusy: (signal) => (signal.source === 'widget' ? 'merge' : 'interrupt') })
h4b.signal({ modality: 'text', parts, source: 'meu-input', whileBusy: 'queue' }) // um sinal

h4b.getSnapshot().input // a política em vigor
```

Regras:

- Só triggers `text`, `transcript` e `audio` seguem a política. Eventos de GUI, comandos, `runAction` e `push` sempre entram na fila.
- Comandos diretos (menu) e capturas nunca são unidos: enquanto um trigger ainda está sendo roteado, a entrada nova só entra na fila, e é unida apenas se a rota for o transporte.
- O `ask()` entra na fila, a não ser que você passe `whileBusy`, porque o resultado dele é aguardado.
- Um trigger na fila com `queue` nunca absorve outros, e um turno cujo trigger tem `queue` nunca é cortado pela política.

Eventos: `signal.merged` (`{ signal, from, resumed }`) e `turn.interrupted` (`{ turnId, messageId?, kept?, removed? }`). O `getSnapshot().queued` mostra o texto unido, então a mensagem pendente esmaecida do widget se atualiza no lugar.

### Interromper sob demanda

`h4b.interrupt()` é o botão de parar, o Escape (o plugin `keyboard` usa) e o barge-in:

1. aborta o job em andamento (transportes e ações recebem o `AbortSignal`);
2. marca a mensagem do assistente daquele turno com `interrupted: true` e corta o texto onde os interceptadores `interrupt.before` disserem que a pessoa parou de recebê-lo: por padrão, tudo o que foi exibido;
3. remove a mensagem se não sobrar nada e ela não tiver tool calls;
4. emite `turn.interrupted` e salva.

Sem nada rodando, só corta a última resposta se um interceptador disser que parte dela não chegou (o plugin de voz informa o que foi falado). `interrupt({ clearQueue: true })` também esvazia a fila. O `abort()` continua existindo e cancela sem mexer no histórico.

```ts
// Um plugin que sabe quanto da resposta a pessoa viu (ex.: revelação gradual):
ctx.intercept('interrupt.before', (point) => ({ ...point, keep: Math.min(point.keep, revelado(point.messageId)) }))
```

Deltas que chegam depois do corte são ignorados. O widget mostra respostas interrompidas com "…" no fim e uma dica (`strings.interrupted`).

### O que o seu backend precisa fazer

- **Parar de gerar quando a requisição é abortada.** O kernel fecha o stream (SSE do AG-UI, HTTP), mas só o servidor consegue parar a chamada ao LLM. Sem isso, a interrupção não economiza tokens.
- **Usar o histórico que recebe.** Os transportes enviam o histórico inteiro a cada execução. Um backend que guarda a própria cópia vai divergir: não verá mensagens unidas, turnos removidos nem respostas cortadas.
- **Aceitar mensagens do assistente truncadas.** Uma resposta interrompida termina no meio. Os transportes incluídos não enviam a marca `interrupted`; se o modelo precisar saber, mapeie num interceptador `request.before` (por exemplo, acrescentando "[interrompido pelo usuário]" ao texto) ou explique no prompt de sistema.

## Voz: conversa contínua

`mode: 'hands-free'` mantém o microfone aberto. Os resultados finais do reconhecedor se acumulam em **um turno pendente** e saem como uma mensagem quando o turno termina.

```ts
import { voice, webSpeechSTT, webSpeechTTS, httpEndOfTurn } from '@handsforbots/voice'

voice({
  stt: webSpeechSTT(),
  tts: webSpeechTTS(),
  mode: 'hands-free',
  endOfTurn: httpEndOfTurn({ url: '/api/fim-de-turno' }), // opcional; sem ele, só silêncio
  turn: { silence: 800, minSilence: 300, maxSilence: 2000, threshold: 0.5, timeout: 600 },
  bargeIn: { minWords: 2 },
})
```

### Quando o turno termina

Depois de cada resultado final, o plugin espera:

- **Sem provedor de fim de turno** (ou carregando, com falha, lento ou sem consentimento): envia depois de `silence` ms de silêncio.
- **Com provedor:** consulta depois de `minSilence` ms. Probabilidade ≥ `threshold` envia na hora; abaixo disso, espera até `maxSilence` ms. Se a resposta demora mais que `timeout` ms, ou falha, o silêncio decide.
- **Reconhecedor que detecta o turno sozinho** (`capabilities.endOfTurn`, resultados marcados com `{ endOfTurn: true | false }`): envia em `endOfTurn: true`, no máximo depois de `maxSilence`; o provedor não é chamado.

Voltar a falar antes disso mantém o turno aberto. Se o reconhecedor mostra palavras mas nunca as finaliza, elas são enviadas depois de `maxSilence`. Se o turno já saiu e a resposta ainda não começou, o kernel junta a continuação a ele (política de entrada acima).

| Controle | Chamada |
|---|---|
| Enviar agora (pular a espera) | `voice.endTurn()`; palavras ainda sendo reconhecidas vão junto |
| Lixeira, continuar ouvindo | `voice.discardTurn()` |
| Enviar e fechar o microfone | `voice.stop()` |
| Descartar e fechar o microfone | `voice.cancel()` |
| Ligar/desligar o modelo em runtime | `voice.setEndOfTurn(provedor \| null)` |
| Tempos e barge-in em runtime | `voice.configure({ turn, bargeIn })` |
| Trocar ou desligar o filtro de eco em runtime | `voice.setEcho(filtro \| null)` |

### Provedores de fim de turno

Um provedor responde uma pergunta: a pessoa terminou ou só fez uma pausa? Ele devolve uma probabilidade; transformar isso em espera é trabalho do plugin, então qualquer provedor pode ser trocado sem mudar o comportamento.

```ts
type EndOfTurn = {
  name: string
  input: 'text' | 'audio'
  historyTurns?: number          // turnos recentes passados ao predict; padrão 6
  remote?: boolean               // o texto ou o áudio sai da página
  consent?: string               // finalidade de consentimento; pulado enquanto não concedida
  isSupported(): boolean | Promise<boolean>
  load?(): Promise<void>         // baixa um modelo sob demanda; o silêncio decide até resolver
  predict(input: { partial; history; language; audio? }, signal: AbortSignal): number | Promise<number>
}
```

Opções, das [Referências](./references.md#detecção-de-fim-de-turno):

| Tipo | Exemplos | Entrada | Onde | Custo |
|---|---|---|---|---|
| Classificador de texto | turn-detector da LiveKit, classificadores estilo BERT (FireRedChat) | transcrição + turnos recentes | seu servidor (`httpEndOfTurn`) ou o navegador | uma requisição por pausa, ou nada se local |
| Classificador de áudio | Smart Turn da Pipecat (ONNX) | últimos segundos de áudio | o navegador (`onnxruntime-web`) ou seu servidor | nada se local |
| Modelo de decisão tipada ou LLM geral | um modelo de decisão, o LLM do seu backend | transcrição + turnos recentes | seu servidor (`httpEndOfTurn`) | tokens por pausa |
| Reconhecedor com endpointing | AssemblyAI, Soniox, OpenAI Realtime (`semantic_vad`) | dentro do STT | o provedor | incluído no STT |

`httpEndOfTurn({ url, headers?, parse?, historyTurns?, consent?, fetch?, name? })` faz POST de `{ partial, history, language }` e lê `{ probability }` ou `{ done: boolean }` (mude com `parse`). As chaves ficam no seu servidor:

```ts
// No servidor (qualquer framework): responda com a probabilidade de a pessoa ter terminado.
app.post('/api/fim-de-turno', async (req, res) => {
  const { partial, history, language } = req.body
  const probability = await meuClassificador(partial, history, language) // seu modelo ou serviço
  res.json({ probability })
})
```

Um provedor local:

```ts
const smartTurn: EndOfTurn = {
  name: 'smart-turn',
  input: 'audio',
  isSupported: () => typeof WebAssembly === 'object',
  load: async () => { sessao = await carregarSmartTurn() },   // ex.: onnxruntime-web
  predict: async ({ audio }) => rodarSmartTurn(sessao, audio!.samples, audio!.sampleRate),
}
```

Provedores de áudio recebem os últimos `turn.audioSeconds` segundos (padrão 8) do mesmo microfone, só de reconhecedores com `capabilities.audio`: `websocketSTT`, `voskSTT` e `voskBrowserSTT`. O Web Speech não expõe o áudio; com `webSpeechSTT`, use um provedor de texto. Meça latência e acerto no seu idioma antes de escolher: os números publicados são dos fornecedores.

### Barge-in

Falar por cima do bot o interrompe quando ele está falando ou exibindo uma resposta que ainda chega. O plugin chama `h4b.interrupt()` antes de parar a fala, então a resposta fica só com as frases já faladas:

- uma transcrição parcial precisa de `minWords` palavras (padrão 2); um resultado final sempre conta;
- backchannels nunca interrompem e são descartados: "aham", "uhum", "tá", "ok", "uh-huh", "mhm"… (uma lista para pt, en e es; troque com `bargeIn: { ignore: [...] }`);
- apertar para falar enquanto o bot responde também interrompe;
- enquanto o bot ainda está pensando (nada exibido), a fala não interrompe: quando o turno termina, o kernel retoma o turno com as duas mensagens.

`bargeIn: false` desliga isso e pausa o reconhecimento enquanto o bot fala, para o microfone não ouvi-lo.

### Filtro de eco

Com alto-falante, a voz do bot volta pelo microfone e o reconhecedor a transcreve como se fosse a pessoa: o bot se interrompe ou responde a si mesmo. O cancelamento de eco do navegador nem sempre ajuda, porque só remove o som que ele sabe que tocou: a fala do `speechSynthesis` sai pelo sistema operacional, fora do caminho de áudio do navegador. Isso acontece mesmo em equipamento bom (o alto-falante de um notebook fica a poucos centímetros do microfone).

Por isso o plugin de voz passa tudo o que ouve enquanto o bot fala, e por um instante depois (`tail`), por um **filtro de eco** antes do barge-in e do turno. O padrão, `textEchoFilter()`, compara palavras, não áudio, então funciona com qualquer reconhecedor, inclusive o Web Speech:

- um texto é eco quando pelo menos `threshold` (padrão 0,6) das palavras repetem o que o bot disse, em sequências de pelo menos `minRun` (padrão 2) palavras seguidas na mesma ordem; maiúsculas, acentos e pontuação são ignorados, e palavras de 4 letras ou mais podem ter uma letra errada;
- a decisão é tudo ou nada: o eco é descartado (`voice.decision` `{ kind: 'ignore', reason: 'echo' }`) e o resto passa inteiro, então quem cita o bot enquanto fala por cima dele nunca é cortado;
- uma palavra sozinha sempre passa: não dá para distinguir da pessoa dizendo a mesma palavra;
- as frases do bot contam enquanto são faladas e por `tail` ms depois (padrão 2000), porque os reconhecedores entregam resultados atrasados; depois disso a pessoa pode repetir o bot à vontade.

É uma peça substituível, como o provedor de fim de turno:

```ts
import { voice, textEchoFilter, type EchoFilter } from '@handsforbots/voice'

voice({ stt, tts, mode: 'hands-free' })                                    // textEchoFilter() por padrão
voice({ stt, tts, mode: 'hands-free', echo: textEchoFilter({ threshold: 0.5, tail: 1500 }) })
voice({ stt, tts, mode: 'hands-free', echo: false })                       // desligado (ex.: só com fone)

const meuFiltro: EchoFilter = {
  name: 'meu-filtro',
  tail: 2000,
  // speech: as frases sendo faladas e as que terminaram dentro de `tail`, da mais antiga para a mais nova
  filter: ({ text, final, speech, language }) => (pareceOBot(text, speech) ? '' : text),
}
h4b.get('voice').setEcho(meuFiltro) // ou null para desligar
```

`filter` devolve o que a pessoa disse: o próprio texto, um texto menor, ou `''` quando era tudo eco. Ele roda a cada transcrição parcial, então precisa ser síncrono e rápido; se lançar um erro, o erro vai para `h4b.on('error')` (`source: 'voice:echo:<nome>'`) e o texto é mantido. `getState().echo` traz o nome do filtro em uso.

### Saída falada

As respostas são faladas **frase a frase enquanto chegam**, então o bot começa a falar antes de a resposta terminar, e uma interrupção sabe quais frases foram ouvidas. A saída segue a entrada (`output: 'auto'`): resposta falada depois de fala, texto depois de digitação.

### Estado para a sua interface

`voice.getState()` (assine com `voice.subscribe()`):

| Campo | Significado |
|---|---|
| `phase` | `idle`, `listening`, `userSpeaking`, `waitingEndOfTurn`, `botSpeaking` |
| `partial` | no mãos-livres, o turno pendente inteiro mais as palavras sendo reconhecidas |
| `endOfTurnAt` | quando o turno pendente será enviado se a pessoa ficar quieta (epoch ms); anime uma contagem a partir dele em vez de consultar |
| `interrupted` | a pessoa cortou a última resposta; volta a `false` quando a próxima começa |
| `endOfTurn` | nome do provedor de fim de turno em uso |
| `listening`, `speaking`, `error`, `stt`, `tts`, `lastInput`, `output`, `mode` | como antes |

Toda interrupção, backchannel ou eco ignorado e fim de turno é informado em `h4b.on('voice.decision', d => …)`: `{ kind: 'interrupt' | 'ignore' | 'end-of-turn' | 'end-of-turn-unavailable', … }`. Registre isso enquanto ajusta.

### Privacidade e eco

- Provedores declaram se o áudio ou o texto saem da página (`remote`). O `webSpeechSTT` conta como remoto: navegadores como o Chrome mandam o áudio para o serviço de fala deles, e no mãos-livres isso é contínuo. Provedores remotos de fim de turno mandam a transcrição para o seu servidor e, de lá, para quem roda o modelo.
- Dê a um provedor uma finalidade `consent` e ele só é usado enquanto ela está concedida ([Consentimento](./consent.md)); o plugin passa ao próximo reconhecedor, ou ao silêncio. Mostrar o aviso e guardar a decisão é do seu app.
- Reconhecedores que abrem o microfone (`httpSTT`, `websocketSTT`, `voskSTT`, `voskBrowserSTT`) usam cancelamento de eco, supressão de ruído e ganho automático. O Web Speech cuida do próprio microfone; o quanto ele ignora a voz do bot depende do aparelho. O [filtro de eco](#filtro-de-eco) cobre o que passar. Teste com e sem fone.
- O Safari no iOS encerra as sessões de reconhecimento sozinho; o mãos-livres as reinicia, mas teste sessões longas em aparelhos reais.

### Ajustes

| Sintoma | Tente |
|---|---|
| Corta a pessoa no meio da frase | aumentar `silence`, ou adicionar um provedor de fim de turno e aumentar `threshold` |
| Demora para responder | diminuir `silence`; com provedor, diminuir `minSilence` e verificar a latência dele |
| O bot interrompe a si mesmo | ver se o `voice.decision` mostra `reason: 'echo'`; diminuir `echo.threshold` ou aumentar `echo.tail`; fone, um reconhecedor de microfone com cancelamento de eco, `minWords` maior, ou `bargeIn: false` |
| Fala da pessoa descartada como eco | aumentar `echo.threshold` ou `minRun`, diminuir `tail`, ou `echo: false` com fone |
| "ok"/"sim" interrompem o bot | acrescentá-los a `bargeIn.ignore` |
| Muitas chamadas ao backend enquanto ele pensa | manter `whileBusy` em `interrupt` ou `merge` (a retomada as une) |
