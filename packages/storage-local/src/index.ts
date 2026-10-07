import {
  definePlugin,
  sameRetention,
  storableSnapshot,
  type Retention,
  type RetentionControl,
  type SessionSnapshot,
  type Storage,
} from '@handsforbots/core'

export type { Retention } from '@handsforbots/core'

/** Where the encryption key comes from. When it stops returning a key, what is stored can't be read. */
export type KeySource = {
  /** The current key (renewing its lifetime). Creates one when `create` is set. Null when there is none or it's unavailable. */
  get(create: boolean): Promise<CryptoKey | null>
  /** True when the key is known to be gone, without a request (lets the sweep delete leftovers). */
  gone?(): boolean
  /** Lifetime after the last use, when known. 0 = until the browser closes. */
  ttlMinutes?: number
  /** Drops the key for good (consent withdrawn). */
  forget?(): void | Promise<void>
}

export type LocalStorageOptions = {
  /** Storage key. Default 'h4b:conversation'. */
  key?: string
  /**
   * Encrypt the stored conversation (AES-GCM) with a key that expires outside
   * the stored data, so it becomes unreadable even if the site is never opened
   * again. Default true.
   */
  encrypt?: boolean
  /** Where the key lives. Default `cookieKey()` (a cookie that expires after 30 minutes idle); see also `backendKey()`. */
  keySource?: KeySource
  /** Default retention. Default 'key'. */
  retention?: Exclude<Retention, 'server'>
  /** Retentions the end user may pick (e.g. in the widget). Empty (default) = fixed by the developer. */
  userChoices?: Exclude<Retention, 'server'>[]
}

export type LocalStorage = Storage & {
  readonly retention: Retention
  /** Remembers a retention for this browser. What was stored under another one is deleted: save again to keep it. Doesn't check `userChoices`. */
  setRetention(retention: Retention): void
  /** Deletes data whose TTL passed or whose key is gone. Runs on load and every minute in the plugin. */
  sweep(): void
  /** Deletes everything this storage keeps in the browser: the conversation under every retention, the retention preference and the key. */
  forget(): Promise<void>
}

type Plain = { version: 1; savedAt: number; snapshot: SessionSnapshot }
type Sealed = { version: 2; savedAt: number; iv: string; data: string }

export const storageLocal = definePlugin<LocalStorageOptions | undefined>({
  name: 'storage-local',
  provides: ['storage', 'retention'],
  consent: 'persistence',
  apply(ctx, options = {}) {
    const keySource = options.keySource ?? cookieKey()
    const storage = createLocalStorage({ ...options, keySource })
    const choices = choicesOf(options)
    const listeners = new Set<() => void>()
    const control: RetentionControl = {
      get current() {
        return storage.retention
      },
      choices,
      location: 'browser',
      encrypted: options.encrypt ?? true,
      keyTtlMinutes: options.encrypt === false ? undefined : keySource.ttlMinutes,
      async set(retention) {
        if (!choices.some((c) => sameRetention(c, retention))) {
          throw new Error(`[h4b] storage-local: retention ${JSON.stringify(retention)} is not one of the choices`)
        }
        storage.setRetention(retention)
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
    const timer = setInterval(() => {
      try {
        storage.sweep()
      } catch (error) {
        ctx.emit('error', { error, source: 'storage' })
      }
    }, 60_000)
    ctx.onDispose(() => clearInterval(timer))
    ctx.onRevoke(() => storage.forget())
  },
})

export function createLocalStorage(options: LocalStorageOptions = {}): LocalStorage {
  const key = options.key ?? 'h4b:conversation'
  const prefKey = `${key}:retention`
  const encrypt = options.encrypt ?? true
  const keys = options.keySource ?? cookieKey()
  const choices = choicesOf(options)

  const area = (retention: Retention): globalThis.Storage | undefined => {
    try {
      return retention === 'tab' ? sessionStorage : localStorage
    } catch {
      return undefined // blocked storage (privacy mode, sandboxed iframes)
    }
  }

  /** The end user's choice is shared by all tabs, so it is read again on every access. */
  const retention = (): Retention => {
    try {
      const saved = localStorage.getItem(prefKey)
      if (saved) {
        const parsed = JSON.parse(saved) as Retention
        if (choices.some((c) => sameRetention(c, parsed))) return parsed
      }
    } catch {
      /* unavailable or corrupted: use the default */
    }
    return choices[0]!
  }

  const ttlOf = (r: Retention) => (typeof r === 'object' ? r.ttlMinutes * 60_000 : 0)

  const read = (r: Retention): Plain | Sealed | null => {
    const raw = area(r)?.getItem(key)
    if (!raw) return null
    try {
      const stored = JSON.parse(raw) as Plain | Sealed
      if (stored.version === (encrypt ? 2 : 1)) return stored
    } catch {
      /* corrupted */
    }
    area(r)?.removeItem(key) // corrupted, or left over from the other `encrypt` setting
    return null
  }

  const expired = (stored: Plain | Sealed, r: Retention) =>
    (ttlOf(r) > 0 && Date.now() - stored.savedAt > ttlOf(r)) || (stored.version === 2 && !!keys.gone?.())

  return {
    get retention() {
      return retention()
    },
    setRetention(next) {
      const before = retention()
      try {
        localStorage.setItem(prefKey, JSON.stringify(next))
      } catch {
        /* not remembered across reloads */
      }
      if (!sameRetention(before, next)) area(before)?.removeItem(key)
    },
    sweep() {
      const r = retention()
      const stored = read(r)
      if (stored && expired(stored, r)) area(r)?.removeItem(key)
    },
    async load() {
      const r = retention()
      const stored = read(r)
      if (!stored) return null
      if (expired(stored, r)) {
        area(r)?.removeItem(key)
        return null
      }
      if (stored.version === 1) return stored.snapshot
      const cryptoKey = await keys.get(false)
      try {
        if (!cryptoKey) throw new Error('no key')
        const json = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromBase64(stored.iv) },
          cryptoKey,
          fromBase64(stored.data),
        )
        return JSON.parse(new TextDecoder().decode(json)) as SessionSnapshot
      } catch {
        area(r)?.removeItem(key) // its key no longer exists
        return null
      }
    },
    async save(snapshot) {
      const r = retention()
      const clean = storableSnapshot(snapshot)
      if (!encrypt) {
        const stored: Plain = { version: 1, savedAt: Date.now(), snapshot: clean }
        area(r)?.setItem(key, JSON.stringify(stored))
        return
      }
      const cryptoKey = typeof crypto !== 'undefined' && crypto.subtle ? await keys.get(true) : null
      if (!cryptoKey) {
        area(r)?.removeItem(key)
        throw new Error('[h4b] storage-local: no encryption key (needs Web Crypto and the key source); the conversation was not saved')
      }
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const data = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        new TextEncoder().encode(JSON.stringify(clean)),
      )
      const stored: Sealed = { version: 2, savedAt: Date.now(), iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
      area(r)?.setItem(key, JSON.stringify(stored))
    },
    clear() {
      for (const r of ['key', 'tab'] as const) area(r)?.removeItem(key)
    },
    async forget() {
      for (const r of ['key', 'tab'] as const) area(r)?.removeItem(key)
      try {
        localStorage.removeItem(prefKey)
      } catch {
        /* blocked storage: nothing was kept */
      }
      if (encrypt) await keys.forget?.()
    },
  }
}

function choicesOf(options: LocalStorageOptions): Retention[] {
  const list: Retention[] = [options.retention ?? 'key', ...(options.userChoices ?? [])]
  return list.filter((r, i) => list.findIndex((o) => sameRetention(o, r)) === i)
}

/* -------------------------------------------------------------------------- */
/* Key sources                                                                */
/* -------------------------------------------------------------------------- */

export type CookieKeyOptions = {
  /** Lifetime after the last load or save. Default 30. 0 = until the browser closes. */
  ttlMinutes?: number
  /** Default 'h4b-key'. */
  name?: string
  /** Default '/'. Narrow it to the paths that show the chat so the cookie travels less. */
  path?: string
  domain?: string
  /** Default 'Strict'. */
  sameSite?: 'Strict' | 'Lax'
}

/**
 * The key lives in a cookie with Max-Age, renewed on use. When the browser
 * drops it, what is stored can no longer be read, even if the site is never
 * opened again. The cookie is readable by the page's scripts and is sent with
 * requests to its path.
 */
export function cookieKey(options: CookieKeyOptions = {}): KeySource {
  const name = options.name ?? 'h4b-key'
  const ttlMinutes = options.ttlMinutes ?? 30
  const importer = keyImporter()

  const write = (raw: string) => {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:'
    document.cookie = [
      `${name}=${raw}`,
      `Path=${options.path ?? '/'}`,
      options.domain ? `Domain=${options.domain}` : '',
      `SameSite=${options.sameSite ?? 'Strict'}`,
      ttlMinutes > 0 ? `Max-Age=${Math.round(ttlMinutes * 60)}` : '',
      secure ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ')
  }

  return {
    ttlMinutes,
    gone: () => typeof document !== 'undefined' && !readCookie(name),
    forget() {
      if (typeof document === 'undefined') return
      document.cookie = [
        `${name}=`,
        `Path=${options.path ?? '/'}`,
        options.domain ? `Domain=${options.domain}` : '',
        'Max-Age=0',
      ]
        .filter(Boolean)
        .join('; ')
    },
    async get(create) {
      if (typeof document === 'undefined') return null
      let raw = readCookie(name)
      if (raw) write(raw)
      else if (create) {
        write(toBase64(crypto.getRandomValues(new Uint8Array(32))))
        raw = readCookie(name) // another tab may have written first; cookies may be blocked
      }
      return raw ? importer(raw) : null
    },
  }
}

export type BackendKeyOptions = {
  /** Endpoint that holds the key for this user's session. */
  url: string
  /** Lifetime the server applies, if you want it shown to users. */
  ttlMinutes?: number
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /** Default 'same-origin', so the server can find the session by its own (HttpOnly) cookie. */
  credentials?: RequestCredentials
  fetch?: typeof fetch
}

/**
 * The key lives on your server, which decides when it expires. Protocol:
 * `GET url` → 200 `{ "key": "<base64url, 32 bytes>" }` (and renews it) or 404;
 * `POST url` → 200 with the existing key or a new one; `DELETE url` (when
 * consent is withdrawn) drops it, and any answer is accepted. The key is
 * fetched on every load and save and kept only in memory.
 */
export function backendKey(options: BackendKeyOptions): KeySource {
  const importer = keyImporter()
  const call = async (method: 'GET' | 'POST' | 'DELETE') => {
    const doFetch = options.fetch ?? globalThis.fetch
    const headers = typeof options.headers === 'function' ? await options.headers() : options.headers
    return doFetch(options.url, {
      method,
      headers: { accept: 'application/json', ...headers },
      credentials: options.credentials ?? 'same-origin',
    })
  }
  return {
    ttlMinutes: options.ttlMinutes,
    async forget() {
      await call('DELETE')
    },
    async get(create) {
      const response = await call(create ? 'POST' : 'GET')
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`[h4b] backendKey: ${response.status} from ${options.url}`)
      const { key } = (await response.json()) as { key?: string }
      return key ? importer(key) : null
    },
  }
}

/** Imports raw keys as non-extractable AES-GCM keys, reusing the last one. */
function keyImporter() {
  let cached: { raw: string; key: CryptoKey } | undefined
  return async (raw: string) => {
    if (cached?.raw !== raw) {
      const key = await crypto.subtle.importKey('raw', fromBase64(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
      cached = { raw, key }
    }
    return cached.key
  }
}

function readCookie(name: string): string | undefined {
  for (const pair of document.cookie.split(';')) {
    const [k, ...v] = pair.trim().split('=')
    if (k === name) return v.join('=') || undefined
  }
  return undefined
}

/** base64url, safe inside a cookie value. */
function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}
