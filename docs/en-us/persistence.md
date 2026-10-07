# Persistence, memory and privacy

Three independent questions decide what happens to a conversation:

| Question | Answered by | Default |
|---|---|---|
| **How much is sent** to the assistant on each turn? | `memory` (mounted by default) | Last 20 turns, older ones as a summary |
| **How much is kept** in the history? | `memory` | Last 100 turns |
| **Where is it kept, and for how long?** | `storage-local` or `storage-backend` | Nowhere: without a storage plugin the conversation lives only in the page |

Tabs are a fourth, separate choice: `tab-sync` decides whether they share the conversation.

```ts
import { createH4B } from '@handsforbots/core'
import { storageLocal } from '@handsforbots/storage-local'
import { tabSync } from '@handsforbots/tab-sync'

const h4b = createH4B({
  memory: { send: 20, keep: 100 }, // the defaults; false unplugs it
  plugins: [storageLocal(), tabSync()],
})
```

## Turns

A turn is one job of the kernel: a user message with everything the assistant and the actions added in response, a `runAction` call, or a `push`. Each message records the `turnId` that added it, so a tool call and its result always stay in the same turn. Messages saved before `turnId` existed are grouped by user message.

## Memory: what is sent and what is kept

`@handsforbots/memory` is a plugin that `createH4B` mounts for you. It does three things:

- **Send window (`send`).** Before each request (`request.before`), it keeps only the last `send` turns, counting the current one. `'all'` sends everything; `'none'` sends only the current turn, for backends that keep the conversation themselves (Rasa, an agent with its own thread memory, or `storage-backend` read by your agent). The history on screen is not affected.
- **Compaction (`compact`).** Turns that leave the window are folded into a summary, sent as the context signal `memory.summary` (every transport forwards context signals). The summary is brought up to date before each request, so no turn is ever just dropped while compaction is on.
  - `'local'` (default): no LLM. One line per message, actions with their outcome (`Action filter_orders({"status":"late"})` / `→ filter_orders: ok`), long texts clipped, rich UI and media left out. Free and predictable, but coarse.
  - A `Summarizer` function, such as `httpSummarizer({ url })`, to have your backend summarize with an LLM. It receives the previous summary and the turns leaving the window. If it fails, the local summary is used and an `error` with source `memory` is emitted.
  - `false`: older turns are simply not sent.
  - `maxSummaryChars` (4000) caps the summary; the oldest lines go first.
- **Retention by turns (`keep`).** After each job, turns beyond `keep` are removed from the history, and so from storage. With compaction on, only turns already in the summary are removed. `keep` is never smaller than `send`; `'all'` keeps everything.

The summary is part of the conversation snapshot (`SessionSnapshot.memory`), so it is stored and restored with it. `h4b.reset()` forgets it. The `memory` service exposes `options`, `summary`, `view(request)` (what would be sent) and `maintain()`; the `memory.changed` event reports new summaries and removed messages.

```ts
import { httpSummarizer, memory } from '@handsforbots/memory'

createH4B({ memory: { send: 10, keep: 50, compact: httpSummarizer({ url: '/api/h4b/summary' }) } })
createH4B({ memory: { send: 'none' } }) // the backend remembers
createH4B({ memory: false })            // send and keep everything
createH4B({ plugins: [memory({ send: 30 })] }) // your own instance replaces the default
```

`httpSummarizer` posts `{ previous, messages }` (the H4B messages of the turns leaving the window) and expects `{ summary }`:

```ts
// Express, with the provider key on the server
app.post('/api/h4b/summary', async (req, res) => {
  const { previous, messages } = req.body
  const summary = await llm(`Update this conversation summary.\nSummary so far: ${previous ?? '(none)'}\nNew turns: ${JSON.stringify(messages)}`)
  res.json({ summary })
})
```

## Where the conversation is kept

### In the browser: `storage-local`

Encrypted by default (AES-GCM, Web Crypto). The key is kept **outside** the stored data and expires, so after the deadline nothing readable is left, even if the person never comes back to the site. This is the protection; the encryption is how it is enforced.

| Key source | Who expires the key | Notes |
|---|---|---|
| `cookieKey({ ttlMinutes: 30 })` (default) | The browser (`Max-Age`, renewed on every load and save) | `SameSite=Strict`, `Secure` on https, `path` configurable. ~60 bytes travel with requests to that path |
| `backendKey({ url })` | Your server | The key is fetched on every load and save and kept only in memory |

```ts
storageLocal()                                                   // cookie key, 30 min idle
storageLocal({ keySource: cookieKey({ ttlMinutes: 0 }) })        // until the browser closes
storageLocal({ keySource: backendKey({ url: '/api/h4b/key' }) }) // key on the server
storageLocal({ encrypt: false })                                 // plain JSON (only for non-sensitive demos)
```

`backendKey` protocol: `GET url` → `200 { "key": "<base64url, 32 random bytes>" }` (and renew its expiry) or `404`; `POST url` → `200` with the existing key or a new one. Identify the user by your own session cookie (sent with `credentials: 'same-origin'`).

```ts
// Express: one key per session, expiring after 30 minutes without use
const keys = new Map<string, { key: string; expires: number }>()
const TTL = 30 * 60_000
app.get('/api/h4b/key', (req, res) => {
  const entry = keys.get(req.session.id)
  if (!entry || entry.expires < Date.now()) return res.sendStatus(404)
  entry.expires = Date.now() + TTL
  res.json({ key: entry.key })
})
app.post('/api/h4b/key', (req, res) => {
  let entry = keys.get(req.session.id)
  if (!entry || entry.expires < Date.now()) entry = { key: crypto.randomBytes(32).toString('base64url'), expires: 0 }
  entry.expires = Date.now() + TTL
  keys.set(req.session.id, entry)
  res.json({ key: entry.key })
})
```

Without a key the stored data can't be read: it is deleted on the next load or by the sweep that runs every minute. If there is no key source available (no Web Crypto, cookies blocked), nothing is saved and `save()` reports an `error` with source `storage`. Blobs (photos, audio) are always replaced by `omitted_media` placeholders.

### On your server: `storage-backend`

```ts
import { storageBackend } from '@handsforbots/storage-backend'

createH4B({ plugins: [storageBackend({ url: '/api/h4b/conversation' })] })
```

`GET url` loads (`200` with the snapshot, or `204`/`404`), `PUT url` saves it, `DELETE url` clears it. Every request carries `X-H4B-Conversation` (a random id kept in localStorage, or in sessionStorage with the `'tab'` retention) and `X-H4B-Retention` (`server`, `tab` or the TTL in minutes). Your server enforces the retention. Anyone holding the id can read the conversation: when users are signed in, tie it to their session.

```ts
// Express, in memory (use your database)
const conversations = new Map<string, { snapshot: unknown; expires: number }>()
const ttlOf = (header?: string) => (Number(header) > 0 ? Number(header) : 24 * 60) * 60_000 // 'server' and 'tab': your policy
app.get('/api/h4b/conversation', (req, res) => {
  const entry = conversations.get(req.get('x-h4b-conversation')!)
  if (!entry || entry.expires < Date.now()) return res.sendStatus(404)
  res.json(entry.snapshot)
})
app.put('/api/h4b/conversation', (req, res) => {
  conversations.set(req.get('x-h4b-conversation')!, { snapshot: req.body, expires: Date.now() + ttlOf(req.get('x-h4b-retention')) })
  res.sendStatus(204)
})
app.delete('/api/h4b/conversation', (req, res) => {
  conversations.delete(req.get('x-h4b-conversation')!)
  res.sendStatus(204)
})
```

## How long: retention

Both storages share the `Retention` type from `core`:

| Retention | `storage-local` | `storage-backend` |
|---|---|---|
| `'key'` | Until the key expires (default) | — |
| `'server'` | — | As your server decides (default) |
| `{ ttlMinutes }` | Also deleted after that much inactivity | Sent to the server |
| `'tab'` | sessionStorage: gone when the tab closes | The id lives in sessionStorage: a closed tab can't reach it again; your server's TTL deletes it |

The developer sets the default with `retention` and what end users may choose with `userChoices`:

```ts
storageLocal({ retention: 'key', userChoices: ['tab', { ttlMinutes: 5 }] })
```

Both storages provide the `retention` service (`current`, `choices`, `location`, `encrypted`, `keyTtlMinutes`, `set()`, `subscribe()`). `set()` moves what is stored and remembers the choice in this browser, for every tab. The widget shows a 🔒 button with where the conversation is kept, the choices and *Delete the conversation now* (`h4b.reset()`); `widget({ showPrivacy: false })` hides it, and your own UI can use the service directly.

## Tabs and windows: `tab-sync`

| `mode` | Behavior |
|---|---|
| `sync` (default) | One conversation shared by every tab; histories of the same thread are merged by message id, a different thread (a reset) replaces |
| `notify` | Each tab has its own conversation; the others receive `tabs.activity` (actions, assistant turns, resets) and the context signal `tab-sync.activity` with the last 10, so the assistant knows what happened elsewhere (`context: false` keeps only the event) |
| `off` | Isolated: nothing is broadcast |

Without `tab-sync`, tabs still share the same browser storage: each one loads it when it opens and overwrites it when it saves. For `notify` or `off`, use the `'tab'` retention so each tab keeps its own copy.

## Recipes

| Need | Configuration |
|---|---|
| Shared or public computers | `storageLocal({ retention: 'tab' })`, or `cookieKey({ ttlMinutes: 0 })` |
| Users decide | `userChoices` + the widget's 🔒 panel |
| Nothing in the browser | `storageBackend({ url })` |
| Long decision timelines | Raise `keep` (or `'all'`), keep the backend as the source of truth |
| Fewer tokens per turn | Lower `send`, `compact: httpSummarizer(...)` for better summaries |
| Agent with its own memory | `memory: { send: 'none' }` |
| Store only with consent | `createH4B({ consent })`: storages wait for `persistence`; see [Consent](./consent.md) |
| Anonymize what is stored | `redact()` from `@handsforbots/consent`, on `storage.before` |

## Security notes

- Encryption here **limits how long** the conversation stays readable in the browser. It does **not** protect against XSS: a script injected in the page can read the key cookie, call `backendKey` with the user's session and read `h4b.messages` in memory. An end-to-end XSS review, including this key architecture, is a P0 item in the [ROADMAP](../../ROADMAP.md).
- Don't put secrets in actions' arguments or results: they are history, sent to the backend and stored. Redact personal data with a `request.before` interceptor (what is sent) or `storage.before` (what is stored).
- See also [Security](./security.md) [Consent](./consent.md), and the decisions in [ADR 0008](../adr/0008-persistencia-e-abas.md), [ADR 0009](../adr/0009-memoria.md) and [ADR 0010](../adr/0010-consentimento.md).
