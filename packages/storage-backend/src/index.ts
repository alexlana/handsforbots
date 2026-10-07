import {
  createId,
  definePlugin,
  sameRetention,
  storableSnapshot,
  type Retention,
  type RetentionControl,
  type SessionSnapshot,
  type Storage,
} from '@handsforbots/core'

export type { Retention } from '@handsforbots/core'

export type BackendRetention = Exclude<Retention, 'key'>

export type BackendStorageOptions = {
  /** Endpoint for this conversation: GET loads, PUT saves, DELETE clears. */
  url: string
  /** Default retention, sent to the server in `X-H4B-Retention`. Default 'server'. */
  retention?: BackendRetention
  /** Retentions the end user may pick (e.g. in the widget). Empty (default) = fixed by the developer. */
  userChoices?: BackendRetention[]
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /** Default 'same-origin', so the server also sees its own (HttpOnly) session cookie. */
  credentials?: RequestCredentials
  fetch?: typeof fetch
  /** Browser key that holds the conversation id. Default 'h4b:conversation-id'. */
  idKey?: string
  /**
   * Granted consent purposes, sent in `X-H4B-Consent` (comma-separated) so the
   * server knows what it may do with the conversation (e.g. `review`). The
   * plugin fills it from `h4b.consent` when consent is on.
   */
  consentPurposes?: () => string[] | undefined
}

export type BackendStorage = Storage & {
  readonly retention: BackendRetention
  /** Remembers a retention for this browser and deletes what the server held under the previous one. Save again to keep it. */
  setRetention(retention: BackendRetention): Promise<void>
  /** Forgets the conversation ids and the retention preference kept in this browser (call `clear()` first to delete it on the server). */
  forget(): void
}

export const storageBackend = definePlugin<BackendStorageOptions>({
  name: 'storage-backend',
  provides: ['storage', 'retention'],
  consent: 'persistence',
  apply(ctx, options) {
    const consent = ctx.app.consent
    const granted = () => (consent.enabled ? consent.purposes.filter((p) => consent.granted(p)) : undefined)
    const storage = createBackendStorage({ consentPurposes: granted, ...options })
    const choices = choicesOf(options)
    const listeners = new Set<() => void>()
    const control: RetentionControl = {
      get current() {
        return storage.retention
      },
      choices,
      location: 'server',
      encrypted: false,
      async set(retention) {
        if (retention === 'key' || !choices.some((c) => sameRetention(c, retention))) {
          throw new Error(`[h4b] storage-backend: retention ${JSON.stringify(retention)} is not one of the choices`)
        }
        await storage.setRetention(retention)
        await ctx.app.persist()
        listeners.forEach((l) => l())
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
    }
    ctx.provide('storage', storage)
    ctx.provide('retention', control)
    // Tell the server at once when what it may do with the conversation changes (e.g. `review`).
    let sent = granted()?.join(',')
    ctx.on('consent.changed', () => {
      const now = granted()?.join(',')
      if (now === sent) return
      sent = now
      if (ctx.app.messages.length > 0) void ctx.app.persist()
    })
    ctx.onRevoke(() => storage.forget())
  },
})

/**
 * Keeps the conversation on your server. Every request carries
 * `X-H4B-Conversation` (a random id kept in localStorage, or in sessionStorage
 * with the `'tab'` retention, so a closed tab can't reach it again) and
 * `X-H4B-Retention` (`server`, `tab` or the TTL in minutes). The server
 * enforces the retention and should tie the id to the user's own session
 * when there is one: anyone holding the id can read the conversation.
 */
export function createBackendStorage(options: BackendStorageOptions): BackendStorage {
  const idKey = options.idKey ?? 'h4b:conversation-id'
  const prefKey = `${idKey}:retention`
  const choices = choicesOf(options)

  const area = (r: BackendRetention): globalThis.Storage | undefined => {
    try {
      return r === 'tab' ? sessionStorage : localStorage
    } catch {
      return undefined
    }
  }

  let memoryId: string | undefined // when browser storage is blocked
  const existingId = (r: BackendRetention) => area(r)?.getItem(idKey) ?? memoryId
  const idFor = (r: BackendRetention): string => {
    const store = area(r)
    const existing = store?.getItem(idKey) ?? memoryId
    if (existing) return existing
    const id = createId('conv')
    if (store) store.setItem(idKey, id)
    else memoryId = id
    return id
  }

  const retention = (): BackendRetention => {
    try {
      const saved = localStorage.getItem(prefKey)
      if (saved) {
        const parsed = JSON.parse(saved) as BackendRetention
        if (choices.some((c) => sameRetention(c, parsed))) return parsed
      }
    } catch {
      /* unavailable or corrupted: use the default */
    }
    return choices[0]!
  }

  const request = async (method: 'GET' | 'PUT' | 'DELETE', r: BackendRetention, body?: SessionSnapshot) => {
    const doFetch = options.fetch ?? globalThis.fetch
    const headers = typeof options.headers === 'function' ? await options.headers() : options.headers
    const purposes = options.consentPurposes?.()
    const response = await doFetch(options.url, {
      method,
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
        'x-h4b-conversation': idFor(r),
        'x-h4b-retention': typeof r === 'object' ? String(r.ttlMinutes) : r,
        ...(purposes ? { 'x-h4b-consent': purposes.join(',') } : {}),
        ...headers,
      },
      credentials: options.credentials ?? 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    })
    if (method === 'GET' && (response.status === 204 || response.status === 404)) return null
    if (!response.ok) throw new Error(`[h4b] storage-backend: ${method} ${options.url} returned ${response.status}`)
    return method === 'GET' ? ((await response.json()) as SessionSnapshot | null) : null
  }

  return {
    get retention() {
      return retention()
    },
    async setRetention(next) {
      const before = retention()
      try {
        localStorage.setItem(prefKey, JSON.stringify(next))
      } catch {
        /* not remembered across reloads */
      }
      if (sameRetention(before, next)) return
      if (existingId(before)) await request('DELETE', before)
      area(before)?.removeItem(idKey)
    },
    async load() {
      const snapshot = await request('GET', retention())
      return snapshot?.threadId && Array.isArray(snapshot.messages) ? snapshot : null
    },
    async save(snapshot) {
      await request('PUT', retention(), storableSnapshot(snapshot))
    },
    async clear() {
      if (existingId(retention())) await request('DELETE', retention()) // never mint an id just to delete
    },
    forget() {
      for (const r of ['server', 'tab'] as const) area(r)?.removeItem(idKey)
      memoryId = undefined
      try {
        localStorage.removeItem(prefKey)
      } catch {
        /* blocked storage: nothing was kept */
      }
    },
  }
}

function choicesOf(options: BackendStorageOptions): BackendRetention[] {
  const list: BackendRetention[] = [options.retention ?? 'server', ...(options.userChoices ?? [])]
  return list.filter((r, i) => list.findIndex((o) => sameRetention(o, r)) === i)
}
