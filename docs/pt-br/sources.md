# Fontes e citações

Quando um backend responde a partir de documentos (RAG, busca na web), ele pode dizer à página de onde saiu cada parte da resposta. O H4B leva essas fontes na mensagem do assistente, guarda no histórico, e o widget mostra referências numeradas e uma lista. A busca continua no seu backend. Decisão: [ADR 0014](../adr/0014-fontes-e-citacoes.md).

## O contrato

Uma fonte é uma parte da mensagem do assistente:

```ts
type SourcePart = {
  type: 'source'
  id: string          // único na mensagem; as citações apontam para ele
  title: string       // texto puro
  trail?: string[]    // caminho de títulos, texto puro
  url?: string        // URL http(s) absoluta ou '#ancora'; sem URL é uma referência só texto
  excerpt?: string    // o trecho usado, texto puro, nunca HTML
}
```

Uma citação diz qual trecho de uma parte de texto a fonte sustenta, como fazem as APIs da OpenAI, da Anthropic e do Gemini:

```ts
type TextPart = { type: 'text'; text: string; citations?: Citation[] }

type Citation = {
  start: number       // inclusiva, em unidades UTF-16 (índice de string do JavaScript) no text daquela parte
  end: number         // exclusiva; a referência é posta aqui. start === end cita um ponto
  sourceIds: string[] // ids de partes source da mesma mensagem
}
```

- Uma fonte para a qual alguma citação aponta foi **citada**; as outras foram só **consultadas**. Não há campo de status.
- Uma parte `source` com o mesmo `id` na mesma mensagem substitui a anterior, no mesmo lugar.
- As fontes podem chegar antes do primeiro delta: a página mostra o que vai embasar a resposta enquanto ela é escrita. Elas não quebram o texto: um delta depois de uma fonte continua a mesma parte de texto.
- As fontes ficam no histórico e no storage. Os transportes não as mandam de volta ao backend.

## Mandando fontes do backend

Estímulos: um `message.part` por fonte e `message.citations` para as citações. As citações vão para a **última parte de texto** da mensagem, então mande quando esse texto estiver completo (depois do último delta serve).

```ts
yield { type: 'message.part', messageId, part: { type: 'source', id: 'c1', title: 'Autotrac', url: 'https://example.com/cases/autotrac#capitulo-1' } }
yield { type: 'message.delta', messageId, delta: 'A Autotrac rastreia caminhões.' }
yield { type: 'message.citations', messageId, citations: [{ start: 0, end: 30, sourceIds: ['c1'] }] }
```

Cada transporte tem um formato no fio:

| Transporte | Fontes | Citações |
|---|---|---|
| `transport-agui` | CUSTOM `h4b.sources`, value `{ messageId?, sources: [...] }` (um lote por evento; itens sem `type`) | CUSTOM `h4b.citations`, value `{ messageId?, citations }` |
| `transport-ai-sdk` | partes `source-url` e `source-document` (um documento vira referência só texto) | data part `data-citations`, `{ citations }` |
| `transport-http` | `sources` na resposta ou num chunk SSE | `citations` na resposta ou num chunk SSE |

Sem `messageId`, os eventos do AG-UI vão para a última mensagem vista. Citações malformadas são descartadas e geram um evento `error` com `source: 'message.citations'`.

### Marcadores no texto do modelo

Se o seu modelo escreve marcadores como `[c3]` no texto, tire-os **antes** de mandar e mande citações no lugar. Assim a página nunca vê os marcadores: Markdown, voz e renderizadores recebem o texto limpo.

```ts
import { inlineCitations } from '@handsforbots/core'

const marcadores = inlineCitations({ known: trechos.map((c) => c.id) })
for await (const delta of modelo) {
  const { text, citations } = marcadores.push(delta)
  if (text) enviar({ type: 'message.delta', delta: text })
  if (citations.length) pendentes.push(...citations)
}
const resto = marcadores.end()
// mande resto.text e depois todas as citações num único message.citations
```

- Um marcador partido entre deltas (`[c` + `3]`) fica retido até fechar; o espaço antes do marcador é removido (`palavra [c3].` → `palavra.`).
- Só ids em `known` viram citação; outros colchetes (links Markdown, `[x]`) ficam como texto.
- `delimiters` troca o marcador (`['【', '】']`) e `id`, os caracteres permitidos num id. `stripInlineCitations(texto, opções)` faz o mesmo com um texto inteiro.

### Unidades

As posições são unidades UTF-16. Um transporte cujo provedor conta outra coisa converte: os segmentos de grounding do Gemini contam bytes, então use `utf8OffsetToIndex(texto, byteOffset)`. Sem a conversão, um acento ou um emoji desloca as referências.

## Mostrando as fontes

### Widget

Ligado por padrão:

```ts
widget({
  sources: {
    hosts: ['example.com', '*.docs.example.com'], // opcional: links só para esses hosts
    action: 'open_source',                        // opcional: roda essa ação em vez de seguir o link
    consulted: true,                              // lista também as consultadas e não citadas (padrão)
  },
})
```

- As referências são numeradas pela ordem em que cada fonte é citada pela primeira vez; a lista mostra as citadas nessa ordem e depois, mais discretas, as consultadas (textos `sources` e `consultedSources`).
- Uma fonte sem URL segura é uma referência só texto: o número rola até o item da lista.
- Com `action`, clicar numa fonte ou numa referência roda essa ação registrada com `{ id, title, url?, trail?, messageId }` (origem `user`; aparece como cartão de ação, a menos que `showActions: false`). Use para abrir você mesmo a seção da página, a mesma ação que o assistente ou um agente de navegador pode chamar.
- `sources: false` esconde as referências e a lista.
- Estilize com `::part(citation)` e `::part(sources)`.

### A sua própria interface

`sourceView(mensagem)` (core), `useSources(mensagem)` (React) e `useSources(refOuGetter)` (Vue) entregam o texto já separado das fontes:

```tsx
const { segments, cited, consulted } = useSources(mensagem)
segments.map((s) => (s.kind === 'text' ? s.text : <sup>{s.sourceIds.join(',')}</sup>))
cited.map((s) => <a href={safeSourceUrl(s.url)}>{s.number}. {s.title}</a>)
```

Funções de mais baixo nível: `sourcesOf`, `citedSources` (id → número), `citationSegments(parteDeTexto, idsConhecidos)`, `validCitations`, `isCitation`, `toSourcePart` (para transportes).

## Segurança

As URLs vêm do backend e vão parar na página. Desenhe-as só através de `safeSourceUrl(url, { hosts? })`: ela aceita URLs `http:`/`https:` absolutas sem credenciais e âncoras da própria página (`#secao`). Caminhos relativos (`/a`, `./a`, `//host/a`), `javascript:`, `data:` e qualquer outra coisa dão `undefined`. Desenhe `title`, `trail` e `excerpt` como texto, nunca como HTML. O widget faz as duas coisas.

## Testes

`citedReply(texto, fontes)` do `@handsforbots/testkit` manda uma resposta como um backend com RAG: primeiro as fontes, depois o texto sem os marcadores `[id]`, depois as citações.

```ts
h4b.provide('transport', scriptedTransport([citedReply('A Autotrac rastreia caminhões [c1].', [{ id: 'c1', title: 'Autotrac' }])]))
```
