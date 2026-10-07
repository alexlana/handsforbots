---
name: handsforbots-consent
description: Wire Hands for Bots v2 to a consent tool (cookie banner, CMP or custom form) - createH4B({ consent }), h4b.consent.set() from the tool's callback, purposes (persistence, review, analytics), withConsent() to gate or ungate plugins, declarative rule sets per legislation in JSON/YAML (LGPD, GDPR, CCPA presets from @handsforbots/consent), picking rules by the visitor's region, erasing storage on revoke while the conversation stays on screen, X-H4B-Consent for the server, and anonymizing contacts and documents before storage for human review (redact, storage.before). Use when the task mentions consent, cookies banner, CMP, LGPD, GDPR, CCPA, opt-in/opt-out, revoking or withdrawing consent, anonymization or redaction of stored conversations, or human review of conversations.
---

# Hands for Bots v2 — consent

H4B does **not** draw a banner and does **not** store decisions. The site's consent tool does both; H4B follows what it is told. Full guide: `docs/en-us/consent.md` (`docs/pt-br/consent.md`) in https://github.com/alexlana/handsforbots. Decision: ADR 0010. Related: the `handsforbots-persistence` skill.

## Setup

```ts
import { createH4B } from '@handsforbots/core'
import { presets, redact, regionFromMeta } from '@handsforbots/consent'
import { storageBackend } from '@handsforbots/storage-backend'

const h4b = createH4B({
  consent: {
    rules: presets,                 // or await loadConsentRules('/rules.yml', { parse: YAML.parse })
    region: regionFromMeta(),       // or 'BR', or regionFromUrl('/api/geo') (async)
    initial: decisionsFromTheToolCookie(), // { persistence: true, review: false } — lets storage mount on start()
    manage: () => tool.open(),      // widget shows a button instead of its own checkboxes
  },
  plugins: [storageBackend({ url: '/api/h4b/conversation' }), redact({ when: 'review' })],
})
await h4b.start()
tool.onChange((c) => h4b.consent.set({ persistence: c.functional, review: c.review })) // booleans or 'granted'|'denied'|'pending'
```

Map the tool's categories to H4B purposes yourself; nothing is vendor-specific.

## Verified behavior

- **No `consent` option → no gating**: `consent.enabled === false`, every purpose counts as granted. Adding consent changes nothing until you pass the option.
- **States**: decision (`initial`/`set`) > rule default for the region > `pending`. While an async `region` is unresolved, every undecided purpose is `pending`. No matching rule set (and no `*`) → `pending`.
- **Gating**: `storage-local` and `storage-backend` declare `consent: 'persistence'`. `withConsent(plugin, 'analytics')` gates any plugin; `withConsent(plugin, false)` ungates one. `h4b.use()` follows the same rules.
- **Pending**: gated plugins are not mounted → nothing written (no key cookie, no localStorage, no request). Conversation lives in memory.
- **Granted later**: storage mounts; restores the stored conversation only if no `user` message exists yet, otherwise saves the on-screen conversation over it.
- **Withdrawn** (`denied` or back to `pending`): plugin unmounted, in-flight save awaited, `storage.clear()`, then `ctx.onRevoke` handlers. `storage-local` also removes the retention choice and the key (cookie expired; `backendKey` gets `DELETE url`). `storage-backend` sends `DELETE` and forgets its id. **`h4b.messages` is untouched**: it disappears when the page closes (or the last tab, with `tab-sync`, which is never gated).
- **`denied` on a later visit** erases leftovers (mounts the plugin only to erase). `eraseOnRevoke: false` in the purpose's rule keeps the data (still unmounts).
- **Tabs**: decisions travel on BroadcastChannel `h4b-consent:<channel>` (default `default`; `channel: false` disables). Use `false` in tests that create several instances.
- `await h4b.consent.set(...)` resolves after mounts/unmounts; `await h4b.consent.ready()` waits for an async region too. Event: `consent.changed` with `{ enabled, region, rules, states }`.
- **Server**: `storage-backend` adds `X-H4B-Consent: persistence,review` (granted purposes) to every request and PUTs again when the list changes (if there are messages).
- **`storage.before`** runs before every save (also retention changes). Return a new snapshot (never mutate: it shares objects with the screen) or `null` to skip. `h4b.persist()` saves on demand, serialized, never throws.
- **`redact`**: on `storage.before` by default; `when: 'review'` limits it to while that purpose is granted. Detects `email`, `cnpj`, `cpf`, `card`, `phone`; `custom: { name: /re/g }`; media parts → `redacted_media` (`media: 'keep'` to keep). Stored copy comes back anonymized after reload. Best effort and not an XSS defense: anonymize again on the server before people review.

## Rule sets

```yaml
- id: lgpd
  regions: [BR]                 # ISO 3166: country, subdivision (US-CA) or '*'; most specific wins
  label: { en: LGPD, pt-BR: LGPD }
  purposes:
    persistence: { default: pending, label: { en: Keep this conversation, pt-BR: Guardar esta conversa } }
    review: { default: pending, eraseOnRevoke: true }
```

`parseConsentRules(data)` validates and names the bad field; `createH4B` validates what it gets. Presets (`lgpd`, `gdpr`, `ccpa` opt-out, `optIn` fallback with `*`) are in `@handsforbots/consent/rules/*.json`. They are starting points, **not legal advice**: say so to the user and let their privacy owner decide purposes and defaults.

## Server checklist (storage-backend + review)

- PUT: save under `X-H4B-Conversation` with `X-H4B-Retention`; if `X-H4B-Consent` includes `review`, upsert an anonymized copy into the review queue, else remove it.
- DELETE: delete the conversation **and** its review copy.
- With `backendKey`: also implement `DELETE` (drop the key; any status is accepted).

## Checklist

- [ ] Purposes mapped from the consent tool's categories; `set()` called on every change and `initial` on load.
- [ ] Region source decided (meta tag from CDN header, endpoint, or fixed); `*` fallback rule set present.
- [ ] Storages that don't need consent (other legal basis) wrapped in `withConsent(..., false)`, confirmed with the user.
- [ ] Revoke tested: storage empty, key cookie gone, conversation still on screen, other tab follows.
- [ ] Review flow: `redact({ when: 'review' })` and server-side anonymization before human review.
