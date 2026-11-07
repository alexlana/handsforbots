# Sources and citations

When a backend answers from documents (RAG, web search), it can tell the page where each piece of the answer came from. H4B carries those sources in the assistant message, keeps them in the history, and the widget shows them as numbered references and a list. The search itself stays in your backend. Decision: [ADR 0014](../adr/0014-fontes-e-citacoes.md).

## The contract

A source is a part of the assistant message:

```ts
type SourcePart = {
  type: 'source'
  id: string          // unique within the message; citations refer to it
  title: string       // plain text
  trail?: string[]    // path of headings, plain text
  url?: string        // absolute http(s) URL or '#anchor'; without a URL it is a text-only reference
  excerpt?: string    // the passage used, plain text, never HTML
}
```

A citation says which span of a text part a source backs, as the OpenAI, Anthropic and Gemini APIs do:

```ts
type TextPart = { type: 'text'; text: string; citations?: Citation[] }

type Citation = {
  start: number       // inclusive, UTF-16 code units (JavaScript string index) into that part's text
  end: number         // exclusive; the reference is placed here. start === end cites a point
  sourceIds: string[] // ids of source parts of the same message
}
```

- A source that some citation points to was **cited**; the others were only **consulted**. There is no status field.
- A `source` part with the same `id` in the same message replaces the previous one, in place.
- Sources may arrive before the first delta: the page shows what will back the answer while it is written. They do not split the text: a delta after a source continues the same text part.
- Sources stay in the history and in the storage. Transports do not send them back to the backend.

## Sending sources from the backend

Stimuli: one `message.part` per source, and `message.citations` for the citations. Citations go to the **last text part** of the message, so send them when that text is complete (after the last delta is fine).

```ts
yield { type: 'message.part', messageId, part: { type: 'source', id: 'c1', title: 'Autotrac', url: 'https://example.com/cases/autotrac#chapter-1' } }
yield { type: 'message.delta', messageId, delta: 'Autotrac tracks trucks.' }
yield { type: 'message.citations', messageId, citations: [{ start: 0, end: 23, sourceIds: ['c1'] }] }
```

Each transport has a wire format:

| Transport | Sources | Citations |
|---|---|---|
| `transport-agui` | CUSTOM `h4b.sources`, value `{ messageId?, sources: [...] }` (a batch per event; items without `type`) | CUSTOM `h4b.citations`, value `{ messageId?, citations }` |
| `transport-ai-sdk` | `source-url` and `source-document` parts (a document becomes a text-only reference) | data part `data-citations`, `{ citations }` |
| `transport-http` | `sources` in the response or in an SSE chunk | `citations` in the response or in an SSE chunk |

Without `messageId`, the AG-UI events go to the latest message seen. Malformed citations are dropped and reported as an `error` event with `source: 'message.citations'`.

### Markers in the model's text

If your model writes markers such as `[c3]` in the text, remove them **before** sending, and send citations instead. The page then never sees the markers: Markdown, voice and renderers get clean text.

```ts
import { inlineCitations } from '@handsforbots/core'

const markers = inlineCitations({ known: retrieved.map((c) => c.id) })
for await (const delta of model) {
  const { text, citations } = markers.push(delta)
  if (text) send({ type: 'message.delta', delta: text })
  if (citations.length) pending.push(...citations)
}
const rest = markers.end()
// send rest.text, then all citations as one message.citations
```

- A marker split across deltas (`[c` + `3]`) is held until it closes; the space before a marker is removed (`word [c3].` → `word.`).
- Only ids in `known` become citations; other brackets (Markdown links, `[x]`) stay as text.
- `delimiters` changes the marker (`['【', '】']`), `id` the characters allowed in an id. `stripInlineCitations(text, options)` does the same for a whole text.

### Units

Positions are UTF-16 code units. A transport whose provider counts something else converts them: Gemini grounding segments count bytes, so use `utf8OffsetToIndex(text, byteOffset)`. Without the conversion, an accent or an emoji moves the references.

## Showing sources

### Widget

On by default:

```ts
widget({
  sources: {
    hosts: ['example.com', '*.docs.example.com'], // optional: links only to these hosts
    action: 'open_source',                        // optional: run this action instead of following the link
    consulted: true,                              // list consulted, uncited sources too (default)
  },
})
```

- References are numbered by where each source is first cited; the list shows cited sources in that order and then, dimmer, the consulted ones (strings `sources` and `consultedSources`).
- A source without a safe URL is a text-only reference: its number scrolls to the list item.
- With `action`, clicking a source or a reference runs that registered action with `{ id, title, url?, trail?, messageId }` (origin `user`; it shows as an action card unless `showActions: false`). Use it to open the page section yourself, the same action the assistant or a browser agent can call.
- `sources: false` hides references and the list.
- Style with `::part(citation)` and `::part(sources)`.

### Your own interface

`sourceView(message)` (core), `useSources(message)` (React) and `useSources(refOrGetter)` (Vue) give the text already split from the sources:

```tsx
const { segments, cited, consulted } = useSources(message)
segments.map((s) => (s.kind === 'text' ? s.text : <sup>{s.sourceIds.join(',')}</sup>))
cited.map((s) => <a href={safeSourceUrl(s.url)}>{s.number}. {s.title}</a>)
```

Lower-level helpers: `sourcesOf`, `citedSources` (id → number), `citationSegments(textPart, knownIds)`, `validCitations`, `isCitation`, `toSourcePart` (for transports).

## Security

URLs come from the backend and end up in the page. Render them only through `safeSourceUrl(url, { hosts? })`: it accepts absolute `http:`/`https:` URLs without credentials, and same-page anchors (`#section`). Relative paths (`/a`, `./a`, `//host/a`), `javascript:`, `data:` and anything else give `undefined`. Render `title`, `trail` and `excerpt` as text, never as HTML. The widget does both.

## Testing

`citedReply(text, sources)` from `@handsforbots/testkit` sends a reply the way a RAG backend does: sources first, then the text without its `[id]` markers, then the citations.

```ts
h4b.provide('transport', scriptedTransport([citedReply('Autotrac tracks trucks [c1].', [{ id: 'c1', title: 'Autotrac' }])]))
```
