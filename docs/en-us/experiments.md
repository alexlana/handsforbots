# Experiments and conversation attributes

Hands for Bots carries the generic part of an A/B test: which variant a conversation is in, who saw it, who went on to talk, and the backend knowing it too. What each variant means, the queries and the statistics stay in your app. Decision: [ADR 0017](../adr/0017-atributos-da-conversa.md).

## Conversation attributes

Short codes attached to a conversation:

```ts
h4b.setConversationAttributes({ 'greeting.kind': 'directed', 'greeting.index': 3 })
h4b.conversation.attributes // { 'greeting.kind': 'directed', 'greeting.index': 3 }
h4b.setConversationAttributes({ 'greeting.index': null }) // null removes a key
```

- **Codes only.** Keys are lowercase (`a-z`, digits, `_ . -`, up to 64 characters). Values are numbers, booleans, or strings of letters, digits and `_ . : -` with no spaces (up to 64 characters). A sentence does not fit, so the visitor's text cannot get in by accident. At most 16 attributes. Anything else is left out, with an `error` event (`source: 'conversation.attributes'`).
- **They belong to the conversation.** They are saved with it (`SessionSnapshot.attributes`, in `storage-local` and `storage-backend`), come back when a stored conversation is restored, follow it across tabs with `tab-sync`, and are cleared by a new conversation (`h4b.reset()`).
- **Event.** `conversation.attributes` `{ attributes, reason: 'set' | 'restored' | 'reset' }`.
- **What reads them.** `observability` puts them on every span and sends them to your backend (below). Nothing else sends them.

## Drawing a variant

`pickVariant(variants, previous?, random?)` from `@handsforbots/core` draws one item and returns `{ variant, index }`. It avoids `previous` (the index drawn last) when there is another option. `pickGreeting` in the widget uses it.

## Exposures

An exposure says that someone saw a variant. It is what you divide by:

```ts
h4b.setConversationAttributes({ 'nudge.variant': 'b' })
h4b.expose('nudge') // uses the conversation's attributes; or h4b.expose('nudge', { 'nudge.variant': 'b' })
```

The `experiment.exposed` event carries `{ experiment, attributes, threadId, at }`. Exposures are kept **in memory** for the conversation on screen (`h4b.exposures`). They are never stored, and `reset()` or a restore clears them. This is what lets `observability` record an exposure that happened before `analytics` was granted. A greeting is drawn as the page opens, often before the visitor answers the consent banner.

## The greeting as an experiment

In `widget({ greeting })`, an option can carry attributes:

```ts
widget({
  greeting: {
    experiment: 'greeting', // the default
    random: [
      { text: 'Ask me anything.', attributes: { 'greeting.kind': 'open', 'greeting.index': 0 } },
      { text: ['Hi!', 'Want to see the projects?'], attributes: { 'greeting.kind': 'directed', 'greeting.index': 1 } },
    ],
  },
})
```

The widget sets the drawn option's attributes on the conversation and calls `h4b.expose(experiment, attributes)` before showing it. Plain strings and arrays work as before. A reload that restores the conversation does not draw again, and its attributes come back from storage.

`pickGreeting(greeting, previous?, random?)` returns `{ lines, index?, attributes? }` for an interface you draw yourself. Setting the attributes and exposing them is then up to you.

With `consent` in `createH4B`, the index of the option shown last (`h4b-widget-greeting`) only goes to `localStorage` once `persistence` is granted. Until then it stays in memory, so a new conversation in the same page still gets another option.

## What observability records

With [`observability`](./plugins.md#observability) mounted (gate it with `withConsent(observability(...), 'analytics')`):

- **Spans.** The conversation's attributes go on every event and span (turn root, phases, events).
- **`baggage` header.** `getTraceHeaders()` returns a W3C `baggage` header next to `traceparent`, e.g. `greeting.kind=directed,greeting.index=3`. If the OpenTelemetry propagator already put a `baggage` header, the two are merged.
- **Exposure event.** `experiment.exposed` is an event with the experiment and its attributes. An exposure from before the plugin mounted is recorded once, with `late: true`.
- **Counters.** `h4b_experiment_exposed_total` (labels: `experiment` + the exposure's attributes) and `h4b_conversation_engaged_total` (the conversation's first visitor turn, labels: the conversation's attributes). A visitor turn is a trigger that is not a sensor reading nor an idle nudge (`meta.reason: 'idle'`). Counters are never sampled nor rate-limited: traces are sampled and kept for days, while counters add up for as long as your metrics store keeps them. "Saw it and did not talk" is `exposed − engaged` per variant.
- **Nothing without `analytics`.** While the plugin is not mounted, no span, header or counter leaves the page. If `analytics` is granted later in the same page, exposures (and the engagement, if the visitor already wrote) are recorded then. Revoking and granting again does not count them twice.

Attributes become metric labels, so keep their values few: an index or a kind, never an id per visitor.

```ts
agui({ url: '/api/agent', headers: () => h4b.get('observability')?.getTraceHeaders() ?? {} })
```

## On your server

`@handsforbots/observability/server` reads the `baggage` header and keeps only what you allow. It does not depend on the browser or on the kernel:

```ts
import { readConversationAttributes } from '@handsforbots/observability/server'

const attributes = readConversationAttributes(request.headers, {
  allow: { 'greeting.kind': 'string', 'greeting.index': 'number' },
})
span.setAttributes(attributes) // or choose a prompt by variant
```

`allow` is a list of keys (values stay strings) or an object with each key's type (`string`, `number`, `boolean`). A value that does not convert, is longer than `maxLength` (default 64) or is not a code is dropped. Anyone can send any header, so never trust it for more than labelling.

## What stays in your app

- The texts and what each variant means.
- How you query the results.
- The statistics.
