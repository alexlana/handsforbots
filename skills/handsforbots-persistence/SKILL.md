---
name: handsforbots-persistence
description: Configure what Hands for Bots v2 sends, keeps and stores - the memory plugin (turns sent to the assistant, turns kept, compaction into a summary), storage-local (encrypted in the browser with a key in an expiring cookie or on the backend), storage-backend (conversation on your server), retention choices for developers and end users (widget privacy panel), and tab-sync modes (sync, notify, off). Use when the task involves persisting or restoring a conversation, token/history limits, summaries, privacy or data retention, shared computers, multiple tabs or windows, or implementing the server endpoints these packages call.
---

# Hands for Bots v2 — persistence, memory and privacy

Three independent decisions, plus tabs. Settle each one explicitly; the defaults are reasonable but not always right.

| Decision | Package | Default |
|---|---|---|
| How much is **sent** per turn | `@handsforbots/memory` (mounted by `createH4B` automatically) | Last 20 turns + summary of older ones (context signal `memory.summary`) |
| How much is **kept** in history | `@handsforbots/memory` | Last 100 turns |
| **Where** it is stored and **how long** | `@handsforbots/storage-local` or `@handsforbots/storage-backend` | Not stored (page lifetime only) |
| Tabs | `@handsforbots/tab-sync` | Without it, tabs share browser storage but not live state |

Full guide: `docs/en-us/persistence.md` (`docs/pt-br/persistence.md`) in https://github.com/alexlana/handsforbots. Decisions: ADR 0008 and 0009.

**Consent:** with `createH4B({ consent })`, both storages require the purpose `persistence`: they mount only while it is granted and erase everything they kept when it is withdrawn (the conversation on screen stays). See the `handsforbots-consent` skill.

## Memory

```ts
createH4B({ memory: { send: 20, keep: 100, compact: 'local', maxSummaryChars: 4000 } }) // defaults
createH4B({ memory: { send: 'none' } })   // backend/agent keeps the conversation (Rasa, threads)
createH4B({ memory: { compact: httpSummarizer({ url: '/api/h4b/summary' }) } }) // LLM summary on your server
createH4B({ memory: false })               // send and keep everything
createH4B({ plugins: [memory({ send: 30 })] }) // explicit instance replaces the default
```

- A **turn** is one kernel job (user message + answer, a `runAction`, a `push`). Messages carry `turnId`; a tool call and its result never split.
- `send` counts the current turn. `'all'` / `'none'` / number. The screen keeps showing the stored history.
- The summary is updated **before** each request (async `request.before`), so a slow `Summarizer` delays the turn that pushes old turns out. On failure it falls back to the local summary and emits `error` with source `memory`.
- `keep` removes turns from the history (and the screen, and storage) after each job; with compaction it removes only summarized turns. `keep >= send` is enforced.
- The summary lives in `SessionSnapshot.memory` and is stored with the conversation. `reset()` clears it.
- `httpSummarizer` POSTs `{ previous, messages }` and expects `{ summary }`.
- Transports no longer cap history themselves; `contextWindow` on `universalLLM` / `openAICompatible` is only an extra, optional cap.

## Storage in the browser: `storageLocal`

```ts
storageLocal()                                                   // AES-GCM; key in cookie 'h4b-key', 30 min idle
storageLocal({ keySource: cookieKey({ ttlMinutes: 15, path: '/app' }) })
storageLocal({ keySource: backendKey({ url: '/api/h4b/key' }) }) // server holds and expires the key
storageLocal({ retention: 'tab' })                               // sessionStorage
storageLocal({ retention: 'key', userChoices: ['tab', { ttlMinutes: 5 }] })
```

- The point of the encryption is a **guaranteed deadline**: when the key is gone (cookie expired, server dropped it), the data is unreadable and is deleted on the next load or by the 1-minute sweep.
- `backendKey` endpoint: `GET` → `200 { key }` (renew) or `404`; `POST` → `200 { key }` (existing or new); `DELETE` (consent withdrawn) drops it. 32 random bytes, base64url. Identify the user by the server's own session cookie.
- No Web Crypto or no cookies → nothing is saved; `save()` reports `error` source `storage`. Don't silently switch to `encrypt: false` for real users.
- Blobs become `omitted_media` placeholders.
- **Not an XSS defense**: scripts on the page can read the key and `h4b.messages`.

## Storage on the server: `storageBackend`

```ts
storageBackend({ url: '/api/h4b/conversation', retention: 'server', userChoices: [{ ttlMinutes: 30 }, 'tab'] })
```

Endpoint contract (implement all three; with consent on, requests also carry `X-H4B-Consent` with the granted purposes): `GET` → `200` snapshot JSON, or `204`/`404`; `PUT` body = snapshot; `DELETE` clears. Headers: `X-H4B-Conversation` (random id from localStorage, or sessionStorage for `'tab'`), `X-H4B-Retention` (`server` | `tab` | minutes). The server must enforce the TTL and, for signed-in users, bind the id to their session (the id alone grants access). Requests use `credentials: 'same-origin'` by default.

## Retention and end users

`Retention = 'key' | 'server' | 'tab' | { ttlMinutes }`. `retention` is the developer default; `userChoices` lists what users may pick. Both storages provide the `retention` service: `current`, `choices`, `location`, `encrypted`, `keyTtlMinutes`, `set(r)` (moves stored data, remembered in localStorage for all tabs), `subscribe`. The widget shows it behind 🔒 with "delete now" (`showPrivacy: false` hides it); custom UIs call the service.

## Tabs

`tabSync({ mode })`: `'sync'` (default, one shared conversation), `'notify'` (own conversation per tab; others get `tabs.activity` and the context signal `tab-sync.activity` with the last 10 activities), `'off'`. With `notify`/`off`, use `retention: 'tab'` or tabs overwrite each other's stored conversation.

## Pitfalls

- `await h4b.ask()` resolves at the end of the turn, possibly before the async save and the memory pass finish. In tests that reload, `await waitForIdle(h4b)` (testkit) and `await h4b.get('memory')?.maintain()`.
- Turns removed by `keep` disappear from the widget too. Size `keep` for how far back users scroll, or keep the backend as the source of truth.
- In `tab-sync` `sync` mode, merging is a union by id: messages one tab trimmed can come back until the next memory pass.
- Put nothing secret in action args/results: they are history (sent, stored, summarized).

## Checklist

- [ ] Chose browser vs server storage, and the retention default; decided whether users get `userChoices`.
- [ ] If `backendKey` / `storageBackend` / `httpSummarizer`: the endpoints exist, use the user's session, enforce expiry, and keep provider keys on the server.
- [ ] `send` / `keep` fit the backend: `'none'` if it already keeps the thread.
- [ ] Shared devices: `'tab'` retention or a short key TTL.
- [ ] Tabs: `tabSync` mode chosen; `'tab'` retention with `notify`/`off`.
- [ ] Tested reload, key expiry (delete the cookie) and a second tab.
