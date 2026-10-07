# Consent

Hands for Bots works alongside your consent tool (the cookie banner, or a form of your own). It does not draw the banner or store the decision: your tool does both and tells H4B what the person allowed. H4B then:

- **mounts** the plugins that need a purpose only while it is granted. Storages need `persistence`;
- **unmounts** them when consent is withdrawn and **erases what they stored**. The conversation on screen stays until the page is closed, or until every tab is closed when `tab-sync` shares it;
- **tells your server** which purposes are granted (`X-H4B-Consent`), so it knows, for example, that it may queue the conversation for human review;
- **anonymizes** contacts and documents before the conversation is stored, if you add the `redact` plugin.

Without the `consent` option nothing changes: every purpose counts as granted, and plugins mount as they always did.

> The rule sets in `@handsforbots/consent` are starting points, not legal advice. Whoever answers for privacy where you operate decides the purposes, the defaults and the legal basis. Some storage may not need consent at all, and `withConsent(plugin, false)` covers that case.

## Turning it on

```ts
import { createH4B } from '@handsforbots/core'
import { presets, regionFromMeta } from '@handsforbots/consent'
import { storageBackend } from '@handsforbots/storage-backend'
import { tabSync } from '@handsforbots/tab-sync'
import { widget } from '@handsforbots/widget'

const h4b = createH4B({
  consent: {
    rules: presets,               // LGPD, GDPR, CCPA and an opt-in fallback
    region: regionFromMeta(),     // <meta name="h4b-region" content="BR">, written by your server
    initial: readMyConsentCookie(), // what your tool already knows, e.g. { persistence: true }
    manage: () => myConsentTool.open(),
  },
  plugins: [storageBackend({ url: '/api/h4b/conversation' }), tabSync(), widget()],
})
await h4b.start()

// Your consent tool's callback, whenever the person decides or changes their mind:
myConsentTool.onChange((choices) =>
  h4b.consent.set({ persistence: choices.functional, review: choices.conversationReview }),
)
```

| Option | What it does |
|---|---|
| `rules` | One rule set or a list. With a list, `region` picks one. Without rules, every purpose starts `pending` |
| `region` | A code (`BR`, `US-CA`) or a function, which may be async. Until it resolves, every purpose without a decision is `pending` |
| `initial` | Decisions known at load, so storage can mount (and restore the conversation) on `start()` |
| `manage` | Opens your tool. The widget then shows a *Privacy preferences* button instead of its own checkboxes |
| `channel` | BroadcastChannel name that carries decisions to the other tabs (default `'default'`), or `false` |

## States and purposes

A purpose is a name you choose. The presets use three:

| Purpose | Gates |
|---|---|
| `persistence` | `storage-local` and `storage-backend` (their default) |
| `review` | Nothing by itself. It is sent to your server in `X-H4B-Consent`, and `redact({ when: 'review' })` can follow it |
| `analytics` | Whatever you wrap: `withConsent(observability(...), 'analytics')` |

Each purpose is `granted`, `denied` or `pending`. A decision (`initial`, `set`) always wins. Without one, the default comes from the rule set in force, and a purpose missing from it is `pending`. In `set()`, `true` and `false` are short for `granted` and `denied`.

```ts
h4b.consent.state('persistence') // 'granted' | 'denied' | 'pending'
h4b.consent.granted('review')    // boolean
h4b.consent.purposes             // from the rules in force and the decisions
h4b.consent.snapshot()           // { enabled, region, rules: 'lgpd', states: { … } }
await h4b.consent.set({ review: false })   // resolves once plugins were mounted or unmounted
await h4b.consent.setRegion('DE')
h4b.consent.subscribe(render)    // or h4b.on('consent.changed', …)
```

## What happens, step by step

| Moment | Effect |
|---|---|
| `pending` (no decision yet) | Storage is not mounted, so nothing is written: no key cookie, no `localStorage`, no request to your server. The conversation lives in memory |
| Granted | Storage mounts. If nothing was typed yet, the stored conversation is restored. Otherwise the conversation on screen is kept and saved, replacing the stored one |
| Withdrawn (`denied`, or back to `pending`) | Storage unmounts and everything it kept is erased: the conversation under every retention, the key cookie (or `DELETE` to `backendKey`), the retention choice, and the conversation id (after a `DELETE` to `storage-backend`). The conversation on screen stays |
| `denied` on a later visit | Leftovers from an earlier visit are erased the same way |
| Another tab decides | The decision arrives through the BroadcastChannel and the same steps run there |
| Page closed | What was only in memory is gone. With `tab-sync`, the conversation lives on while any tab of the site is open |

`eraseOnRevoke: false` in a purpose's rule keeps what was stored when consent is withdrawn (storage still unmounts). Use it only when another legal basis covers keeping the data.

## Rule sets: one per legislation, declarative

A rule set is plain JSON, so it can live in a `.json` or `.yml` file that your legal team edits:

```yaml
# consent/rules.yml
- id: lgpd
  label: { en: LGPD (Brazil), pt-BR: LGPD (Brasil) }
  regions: [BR]
  purposes:
    persistence:
      default: pending           # opt-in
      label: { en: Keep this conversation, pt-BR: Guardar esta conversa }
    review:
      default: pending
      label: { en: Human review, pt-BR: Revisão por pessoas }
      description: { en: Kept with contacts and documents anonymized, reviewed by our team. }
- id: ccpa
  regions: [US-CA]
  purposes:
    persistence: { default: granted }   # opt-out
    review: { default: granted }
- id: elsewhere
  regions: ['*']
  purposes:
    persistence: { default: pending }
    review: { default: pending }
```

```ts
import YAML from 'yaml'
import { loadConsentRules, regionFromUrl } from '@handsforbots/consent'

createH4B({
  consent: {
    rules: await loadConsentRules('/consent/rules.yml', { parse: YAML.parse }),
    region: regionFromUrl('/api/geo'), // answers "BR", or { "region": "BR" }
  },
})
```

| Field | Meaning |
|---|---|
| `id` | Shown in `snapshot().rules` and in `consent.changed` |
| `regions` | ISO 3166 country (`BR`) or subdivision (`US-CA`) codes, or `*`. A country also matches its subdivisions, and the most specific match wins. Absent means `*` |
| `purposes.<name>.default` | `pending` (opt-in), `granted` (opt-out) or `denied` |
| `purposes.<name>.eraseOnRevoke` | Default `true` |
| `label`, `description` | A string, or one per language. The widget picks the one for its `language` |

`parseConsentRules(data)` validates a rule set and names the field that is wrong. `createH4B` validates the ones it receives. The presets (`lgpd`, `gdpr`, `ccpa`, `optIn`, all together in `presets`) are also in `@handsforbots/consent/rules/*.json`, so you can copy and edit them.

### Following where the visit comes from

The browser cannot tell reliably where a visit comes from. Your server or CDN can:

- **Meta tag:** write the CDN's geo header (`CF-IPCountry`, `CloudFront-Viewer-Country`, `X-Vercel-IP-Country`…) into the page as `<meta name="h4b-region" content="BR">` and use `regionFromMeta()`.
- **Endpoint:** `regionFromUrl('/api/geo')` asks an endpoint of yours. A failure counts as an unknown region, so only `*` rule sets apply.
- **Region changes:** `h4b.consent.setRegion(code)` switches the rule set later, for example when a signed-in person's country is known. Decisions already made are kept.

Without a matching rule set (and no `*`), every purpose is `pending`.

## Gating other plugins

```ts
import { withConsent } from '@handsforbots/core'

plugins: [
  withConsent(observability({ exporters }), 'analytics'), // mounted only with analytics
  withConsent(storageLocal({ retention: 'tab' }), false), // never gated (another legal basis)
]
```

Plugin authors set a default with `definePlugin({ consent: 'purpose', … })`, and clean up with `ctx.onRevoke(fn)`, which runs after the plugin was unmounted because consent was withdrawn (never on `stop()`). When the plugin provided `storage`, the kernel has already called `clear()`. `h4b.use(plugin)` follows consent the same way.

## Human review with anonymization

The second tool, consent to keep conversations so people can review them, maps to the `review` purpose:

```ts
import { redact } from '@handsforbots/consent'

createH4B({
  consent: { rules: presets, region },
  plugins: [
    storageBackend({ url: '/api/h4b/conversation' }),
    redact({ when: 'review' }), // stored copy anonymized while review is granted
  ],
})
```

- Every request from `storage-backend` carries `X-H4B-Consent: persistence,review` (the granted purposes). When the list changes, the conversation is saved again right away, so the server learns about it.
- `redact` runs on `storage.before`: it changes **what is stored**, never what is on screen. It replaces emails, phone numbers, CPF, CNPJ and card numbers with `[email]`, `[phone]`…, and turns photos and files into a `redacted_media` placeholder (type and name only). Add your own patterns with `custom: { id: /AB-\d{4}/g }`. Use `hooks: ['storage.before', 'request.before']` to also hide them from the assistant.
- Detection in the browser is **best effort**, and a script on the page can read the conversation. Anonymize again on your server before anyone reviews it. A good setup keeps the person's own copy under `persistence` and builds a separate anonymized copy for reviewers only while `X-H4B-Consent` includes `review`:

```ts
// Express
app.put('/api/h4b/conversation', async (req, res) => {
  const id = req.get('x-h4b-conversation')!
  const purposes = (req.get('x-h4b-consent') ?? '').split(',')
  await conversations.save(id, req.body, ttlOf(req.get('x-h4b-retention')))
  if (purposes.includes('review')) await reviewQueue.upsert(id, anonymize(req.body)) // your own anonymizer
  else await reviewQueue.remove(id)
  res.sendStatus(204)
})
app.delete('/api/h4b/conversation', async (req, res) => {
  const id = req.get('x-h4b-conversation')!
  await conversations.delete(id)
  await reviewQueue.remove(id) // withdrawing persistence erases the review copy too
  res.sendStatus(204)
})
```

`redactText`, `redactMessages` and `redactor(options)` are also exported, for your own interceptors or for the server.

## Widget

When `consent` is on, the 🔒 button appears even before anything is stored. The panel shows where the conversation is kept ("only on this page" while storage is not mounted) and one line per purpose: a checkbox, or the state and a *Privacy preferences* button when `manage` is set. `widget({ showPrivacy: false })` hides it. Custom interfaces use `h4b.consent` directly.

## Storage-specific details

- **`storage-local`:** before consent, not even the key cookie is written. On revoke, `forget()` deletes the conversation under every retention, the retention choice and the key: the cookie expires at once, and `backendKey` sends `DELETE url`.
- **`storage-backend`:** sends `X-H4B-Consent` when consent is on. On revoke, it sends `DELETE` for the current conversation and forgets the id. It never creates an id just to delete one.
- **`storage.before`** (core hook) runs before every save, including retention changes. Return a new snapshot and never mutate the one you receive. Return `null` to skip that save. `h4b.persist()` saves on demand.

See also [Persistence, memory and privacy](./persistence.md), [Security](./security.md) and [ADR 0010](../adr/0010-consentimento.md).
