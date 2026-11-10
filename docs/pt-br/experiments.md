# Experimentos e atributos da conversa

A Hands for Bots cuida da parte genérica de um teste A/B: em qual variante a conversa está, quem a viu, quem seguiu conversando e o backend saber disso também. O que cada variante quer dizer, as consultas e a estatística ficam no seu app. Decisão: [ADR 0017](../adr/0017-atributos-da-conversa.md).

## Atributos da conversa

Códigos curtos presos a uma conversa:

```ts
h4b.setConversationAttributes({ 'greeting.kind': 'directed', 'greeting.index': 3 })
h4b.conversation.attributes // { 'greeting.kind': 'directed', 'greeting.index': 3 }
h4b.setConversationAttributes({ 'greeting.index': null }) // null remove a chave
```

- **Só códigos.** Chaves em minúsculas (`a-z`, dígitos, `_ . -`, até 64 caracteres). Valores são números, booleanos ou strings de letras, dígitos e `_ . : -` sem espaço (até 64 caracteres). Uma frase não cabe, então o texto do visitante não entra por engano. No máximo 16 atributos. O resto fica de fora, com um evento `error` (`source: 'conversation.attributes'`).
- **São da conversa.** São guardados com ela (`SessionSnapshot.attributes`, no `storage-local` e no `storage-backend`), voltam quando uma conversa guardada é restaurada, acompanham a conversa entre abas com o `tab-sync` e somem numa conversa nova (`h4b.reset()`).
- **Evento.** `conversation.attributes` `{ attributes, reason: 'set' | 'restored' | 'reset' }`.
- **Quem lê.** A `observability` os põe em todo span e os envia ao seu backend (abaixo). Nada mais os envia.

## Sortear uma variante

`pickVariant(variantes, anterior?, random?)`, de `@handsforbots/core`, sorteia um item e devolve `{ variant, index }`. Evita `anterior` (o índice sorteado por último) quando há outra opção. O `pickGreeting` do widget usa essa função.

## Exposições

Uma exposição diz que alguém viu uma variante. É por ela que você divide:

```ts
h4b.setConversationAttributes({ 'nudge.variant': 'b' })
h4b.expose('nudge') // usa os atributos da conversa; ou h4b.expose('nudge', { 'nudge.variant': 'b' })
```

O evento `experiment.exposed` leva `{ experiment, attributes, threadId, at }`. As exposições ficam **em memória** para a conversa na tela (`h4b.exposures`). Nunca são guardadas, e `reset()` ou uma restauração as apaga. É isso que deixa a `observability` registrar uma exposição de antes do `analytics` ser concedido. O cumprimento é sorteado quando a página abre, muitas vezes antes de o visitante responder ao aviso de consentimento.

## O cumprimento como experimento

Em `widget({ greeting })`, uma opção pode levar atributos:

```ts
widget({
  greeting: {
    experiment: 'greeting', // o padrão
    random: [
      { text: 'Pergunte o que quiser.', attributes: { 'greeting.kind': 'open', 'greeting.index': 0 } },
      { text: ['Oi!', 'Quer ver os projetos?'], attributes: { 'greeting.kind': 'directed', 'greeting.index': 1 } },
    ],
  },
})
```

O widget põe os atributos da opção sorteada na conversa e chama `h4b.expose(experiment, attributes)` antes de mostrá-la. Strings e listas funcionam como antes. Uma recarga que restaura a conversa não sorteia de novo, e os atributos voltam do storage.

`pickGreeting(greeting, anterior?, random?)` devolve `{ lines, index?, attributes? }` para uma interface que você desenha. Pôr os atributos na conversa e registrar a exposição fica com você.

Com `consent` no `createH4B`, o índice da opção mostrada por último (`h4b-widget-greeting`) só vai para o `localStorage` depois que `persistence` é concedido. Até lá ele fica em memória, então uma conversa nova na mesma página ainda recebe outra opção.

## O que a observabilidade registra

Com a [`observability`](./plugins.md#observability) montada (condicione com `withConsent(observability(...), 'analytics')`):

- **Spans.** Os atributos da conversa vão em todo evento e span (raiz do turno, fases, eventos).
- **Cabeçalho `baggage`.** `getTraceHeaders()` devolve um cabeçalho W3C `baggage` ao lado do `traceparent`, por exemplo `greeting.kind=directed,greeting.index=3`. Se o propagador do OpenTelemetry já tiver posto um `baggage`, os dois são juntados.
- **Evento de exposição.** `experiment.exposed` é um evento com o experimento e seus atributos. Uma exposição de antes de o plugin montar é registrada uma vez, com `late: true`.
- **Contadores.** `h4b_experiment_exposed_total` (rótulos: `experiment` + os atributos da exposição) e `h4b_conversation_engaged_total` (o primeiro turno do visitante na conversa, rótulos: os atributos da conversa). Turno do visitante é um gatilho que não é leitura de sensor nem lembrete por inatividade (`meta.reason: 'idle'`). Contadores nunca são amostrados nem limitados por taxa: traces são amostrados e guardados por dias, e contadores somam pelo tempo que o seu banco de métricas os guardar. "Viu e não conversou" é `exposed − engaged` por variante.
- **Nada sem `analytics`.** Enquanto o plugin não está montado, nenhum span, cabeçalho ou contador sai da página. Se o `analytics` for concedido depois, na mesma página, as exposições (e o engajamento, se o visitante já escreveu) são registradas nessa hora. Revogar e conceder de novo não conta duas vezes.

Os atributos viram rótulos de métrica, então mantenha poucos valores: um índice ou um tipo, nunca um id por visitante.

```ts
agui({ url: '/api/agent', headers: () => h4b.get('observability')?.getTraceHeaders() ?? {} })
```

## No seu servidor

`@handsforbots/observability/server` lê o cabeçalho `baggage` e guarda só o que você permitir. Não depende do navegador nem do kernel:

```ts
import { readConversationAttributes } from '@handsforbots/observability/server'

const atributos = readConversationAttributes(request.headers, {
  allow: { 'greeting.kind': 'string', 'greeting.index': 'number' },
})
span.setAttributes(atributos) // ou escolha um prompt pela variante
```

`allow` é uma lista de chaves (os valores ficam strings) ou um objeto com o tipo de cada chave (`string`, `number`, `boolean`). Um valor que não converte, passa de `maxLength` (padrão 64) ou não é um código é descartado. Qualquer um pode mandar qualquer cabeçalho, então não confie nele para mais do que rotular.

## O que fica no seu app

- Os textos e o que cada variante quer dizer.
- Como você consulta os resultados.
- A estatística.
