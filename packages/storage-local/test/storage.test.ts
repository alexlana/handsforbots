// @vitest-environment jsdom
import { createH4B, type Transport } from '@handsforbots/core'
import { waitForIdle } from '@handsforbots/testkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { backendKey, cookieKey, createLocalStorage, storageLocal, type LocalStorageOptions } from '../src/index.js'

const echo: Transport = {
  name: 'echo',
  async *run() {
    yield { type: 'message.delta', messageId: `m${Math.random()}`, delta: 'ok' }
  },
}

async function bot(options: LocalStorageOptions = {}) {
  const h4b = createH4B({ plugins: [storageLocal(options)] })
  h4b.provide('transport', echo)
  return h4b.start()
}

/** Asks and waits until the job (and its save) is over. */
async function say(h4b: Awaited<ReturnType<typeof bot>>, text: string) {
  await h4b.ask(text)
  await waitForIdle(h4b)
}

const dropKeyCookie = () => (document.cookie = 'h4b-key=; Max-Age=0; Path=/')

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  dropKeyCookie()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('storage-local', () => {
  it('keeps the conversation across page loads, encrypted', async () => {
    const first = await bot()
    await say(first, 'segredo')
    const raw = localStorage.getItem('h4b:conversation')!
    expect(JSON.parse(raw).version).toBe(2)
    expect(raw).not.toContain('segredo')
    expect(document.cookie).toMatch(/h4b-key=[\w-]{43}/)
    const second = await bot()
    expect(second.conversation.threadId).toBe(first.conversation.threadId)
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it('writes the key cookie with Max-Age, SameSite and Path', async () => {
    const writes: string[] = []
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!
    vi.spyOn(document, 'cookie', 'set').mockImplementation(function (this: Document, value: string) {
      writes.push(value)
      descriptor.set!.call(this, value)
    })
    const h4b = await bot({ keySource: cookieKey({ ttlMinutes: 5, path: '/app' }) })
    await say(h4b, 'oi')
    expect(writes.at(-1)).toMatch(/^h4b-key=[\w-]+; Path=\/app; SameSite=Strict; Max-Age=300$/)
  })

  it('makes the data unreadable when the key cookie expires, and deletes it', async () => {
    const first = await bot()
    await say(first, 'oi')
    dropKeyCookie()
    const second = await bot()
    expect(second.messages).toEqual([])
    expect(localStorage.getItem('h4b:conversation')).toBeNull()
  })

  it('sweep() deletes data whose key is gone without loading it', async () => {
    const storage = createLocalStorage()
    await storage.save({ threadId: 't', messages: [] })
    storage.sweep()
    expect(localStorage.getItem('h4b:conversation')).not.toBeNull()
    dropKeyCookie()
    storage.sweep()
    expect(localStorage.getItem('h4b:conversation')).toBeNull()
  })

  it('can keep the key on the backend', async () => {
    let serverKey: string | undefined
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') serverKey ??= btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      return serverKey ? Response.json({ key: serverKey }) : new Response(null, { status: 404 })
    })
    const keySource = backendKey({ url: '/api/h4b/key', fetch: fetch as typeof globalThis.fetch })
    const first = await bot({ keySource })
    await say(first, 'segredo')
    expect(document.cookie).not.toContain('h4b-key')
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: 'POST', credentials: 'same-origin' })
    expect((await bot({ keySource })).messages).toHaveLength(2)
    serverKey = undefined // the server let it expire
    expect((await bot({ keySource })).messages).toEqual([])
    expect(localStorage.getItem('h4b:conversation')).toBeNull()
  })

  it('a TTL retention also deletes the data after inactivity', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const first = await bot({ retention: { ttlMinutes: 10 } })
    await say(first, 'oi')
    vi.setSystemTime(Date.now() + 11 * 60_000)
    const second = await bot({ retention: { ttlMinutes: 10 } })
    expect(second.messages).toEqual([])
    expect(localStorage.length).toBe(0)
  })

  it("the 'tab' retention uses sessionStorage and drops blobs", async () => {
    const h4b = await bot({ retention: 'tab', encrypt: false })
    await h4b.ask({
      modality: 'image',
      source: 'camera',
      parts: [{ type: 'image', mimeType: 'image/png', source: { kind: 'blob', blob: new Blob(['x']) } }],
    })
    await waitForIdle(h4b)
    const stored = JSON.parse(sessionStorage.getItem('h4b:conversation')!)
    expect(stored.snapshot.messages[0].parts[0]).toMatchObject({ type: 'data', name: 'omitted_media' })
    expect(localStorage.getItem('h4b:conversation')).toBeNull()
  })

  it('saves what the memory plugin keeps, with its summary', async () => {
    const h4b = createH4B({ memory: { send: 1, keep: 2 }, plugins: [storageLocal({ encrypt: false })] })
    h4b.provide('transport', echo)
    await h4b.start()
    for (const text of ['a', 'b', 'c']) await say(h4b, text)
    await h4b.get('memory')!.maintain()
    const stored = JSON.parse(localStorage.getItem('h4b:conversation')!).snapshot
    expect(stored.messages.filter((m: any) => m.role === 'user').map((m: any) => m.parts[0].text)).toEqual(['b', 'c'])
    expect(stored.memory.summary).toContain('User: a')
  })

  it('encrypt: false stores plain JSON and drops encrypted leftovers', async () => {
    await say(await bot(), 'oi')
    const plain = await bot({ encrypt: false })
    expect(plain.messages).toEqual([])
    await say(plain, 'aberto')
    expect(localStorage.getItem('h4b:conversation')).toContain('aberto')
  })

  it('lets end users pick among the allowed retentions', async () => {
    const h4b = await bot({ userChoices: ['tab', { ttlMinutes: 5 }] })
    const retention = h4b.get('retention')!
    expect(retention.choices).toEqual(['key', 'tab', { ttlMinutes: 5 }])
    expect(retention).toMatchObject({ current: 'key', location: 'browser', encrypted: true, keyTtlMinutes: 30 })
    await say(h4b, 'oi')
    const changed = vi.fn()
    retention.subscribe(changed)
    await retention.set('tab')
    expect(changed).toHaveBeenCalled()
    expect(localStorage.getItem('h4b:conversation')).toBeNull()
    expect(sessionStorage.getItem('h4b:conversation')).not.toBeNull()
    // Remembered on the next load.
    const next = await bot({ userChoices: ['tab', { ttlMinutes: 5 }] })
    expect(next.get('retention')!.current).toBe('tab')
    expect(next.messages).toHaveLength(2)
    await expect(retention.set({ ttlMinutes: 60 })).rejects.toThrow(/not one of the choices/)
    // A choice the developer removed is ignored.
    expect((await bot()).get('retention')!.current).toBe('key')
  })

  it('reset() clears what was stored', async () => {
    const h4b = await bot()
    await say(h4b, 'oi')
    await h4b.reset()
    expect(localStorage.getItem('h4b:conversation')).toBeNull()
  })

  it('ignores corrupted data', async () => {
    localStorage.setItem('h4b:conversation', '{not json')
    const h4b = await bot()
    expect(h4b.messages).toEqual([])
  })
})

describe('storage-local with consent', () => {
  it('writes nothing before consent and erases conversation, key and preference on revoke', async () => {
    const h4b = createH4B({
      consent: { channel: false },
      plugins: [storageLocal({ userChoices: ['tab'] })],
    })
    h4b.provide('transport', echo)
    await h4b.start()
    await say(h4b, 'antes')
    expect(localStorage.length).toBe(0)
    expect(document.cookie).not.toMatch(/h4b-key=/)
    await h4b.consent.set({ persistence: true })
    await h4b.persist()
    expect(localStorage.getItem('h4b:conversation')).not.toBeNull()
    expect(document.cookie).toMatch(/h4b-key=/)
    await h4b.get('retention')!.set('tab')
    expect(localStorage.getItem('h4b:conversation:retention')).toBe('"tab"')
    await h4b.consent.set({ persistence: false })
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(document.cookie).not.toMatch(/h4b-key=/)
    expect(h4b.messages).toHaveLength(2)
  })

  it('asks the key server to drop the key on revoke', async () => {
    const methods: string[] = []
    const fetch = vi.fn(async (_url: unknown, init: RequestInit = {}) => {
      methods.push(init.method ?? 'GET')
      if (init.method === 'DELETE') return new Response(null, { status: 204 })
      return Response.json({ key: 'A'.repeat(43) })
    }) as unknown as typeof globalThis.fetch
    const h4b = createH4B({
      consent: { channel: false, initial: { persistence: true } },
      plugins: [storageLocal({ keySource: backendKey({ url: '/key', fetch }) })],
    })
    h4b.provide('transport', echo)
    await h4b.start()
    await say(h4b, 'oi')
    await h4b.consent.set({ persistence: 'denied' })
    expect(methods.at(-1)).toBe('DELETE')
  })
})
