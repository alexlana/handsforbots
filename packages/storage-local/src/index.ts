import { definePlugin, type Message, type Part, type SessionSnapshot, type Storage } from '@handsforbots/core'

export type LocalStorageOptions = {
  /** Storage key. Default 'h4b:conversation'. */
  key?: string
  /** Start a fresh conversation after this much inactivity. Default 30 (as in v1). 0 = never. */
  ttlMinutes?: number
  /** 'local' survives browser restarts; 'session' lasts for the tab. Default 'local'. */
  area?: 'local' | 'session'
  /** Keep only the last N messages. Default 200. */
  maxMessages?: number
}

type Stored = { version: 1; savedAt: number; snapshot: SessionSnapshot }

export const storageLocal = definePlugin<LocalStorageOptions | undefined>({
  name: 'storage-local',
  provides: ['storage'],
  apply(ctx, options = {}) {
    ctx.provide('storage', createLocalStorage(options))
  },
})

export function createLocalStorage(options: LocalStorageOptions = {}): Storage {
  const key = options.key ?? 'h4b:conversation'
  const ttl = (options.ttlMinutes ?? 30) * 60_000
  const area = (): globalThis.Storage | undefined => {
    try {
      return options.area === 'session' ? sessionStorage : localStorage
    } catch {
      return undefined // blocked storage (privacy mode, sandboxed iframes)
    }
  }

  return {
    load() {
      const raw = area()?.getItem(key)
      if (!raw) return null
      try {
        const stored = JSON.parse(raw) as Stored
        if (stored.version !== 1) return null
        if (ttl > 0 && Date.now() - stored.savedAt > ttl) {
          area()?.removeItem(key)
          return null
        }
        return stored.snapshot
      } catch {
        area()?.removeItem(key)
        return null
      }
    },
    save(snapshot) {
      const messages = snapshot.messages.slice(-(options.maxMessages ?? 200)).map(serializable)
      const stored: Stored = { version: 1, savedAt: Date.now(), snapshot: { ...snapshot, messages } }
      area()?.setItem(key, JSON.stringify(stored))
    },
    clear() {
      area()?.removeItem(key)
    },
  }
}

/** Blobs can't be stored as JSON: keep a placeholder instead. */
function serializable(message: Message): Message {
  if (message.role === 'tool') return message
  if (!message.parts.some((p) => p.type !== 'text' && p.type !== 'data' && p.source.kind === 'blob')) return message
  const parts: Part[] = message.parts.map((p) =>
    p.type !== 'text' && p.type !== 'data' && p.source.kind === 'blob'
      ? { type: 'data', name: 'omitted_media', value: { type: p.type, mimeType: p.mimeType, name: p.name } }
      : p,
  )
  return { ...message, parts } as Message
}
