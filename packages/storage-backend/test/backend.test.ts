// @vitest-environment jsdom
import { createH4B, type Transport } from '@handsforbots/core'
import { waitForIdle } from '@handsforbots/testkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { storageBackend, type BackendStorageOptions } from '../src/index.js'

const echo: Transport = {
  name: 'echo',
  async *run() {
    yield { type: 'message.delta', messageId: `m${Math.random()}`, delta: 'ok' }
  },
}

/** In-memory server: conversations by X-H4B-Conversation, with the retention it was told. */
function server() {
  const conversations = new Map<string, { body: any; retention: string }>()
  const calls: { method: string; id: string; retention: string; credentials?: RequestCredentials }[] = []
  const fetch = vi.fn(async (_url: string | URL | Request, init: RequestInit = {}) => {
    const headers = init.headers as Record<string, string>
    const id = headers['x-h4b-conversation']!
    const retention = headers['x-h4b-retention']!
    const method = init.method ?? 'GET'
    calls.push({ method, id, retention, credentials: init.credentials })
    if (method === 'PUT') conversations.set(id, { body: JSON.parse(init.body as string), retention })
    if (method === 'DELETE') conversations.delete(id)
    if (method !== 'GET') return new Response(null, { status: 204 })
    const stored = conversations.get(id)
    return stored ? Response.json(stored.body) : new Response(null, { status: 404 })
  })
  return { conversations, calls, fetch: fetch as unknown as typeof globalThis.fetch }
}

async function bot(options: Partial<BackendStorageOptions> & { fetch: typeof fetch }) {
  const h4b = createH4B({ plugins: [storageBackend({ url: '/api/h4b/conversation', ...options })] })
  h4b.provide('transport', echo)
  return h4b.start()
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('storage-backend', () => {
  it('keeps the conversation on the server', async () => {
    const { fetch, conversations, calls } = server()
    const first = await bot({ fetch })
    await first.ask({
      modality: 'image',
      source: 'camera',
      parts: [{ type: 'image', mimeType: 'image/png', source: { kind: 'blob', blob: new Blob(['x']) } }],
    })
    await waitForIdle(first)
    expect(calls[0]).toMatchObject({ method: 'GET', retention: 'server', credentials: 'same-origin' })
    expect(calls.at(-1)!.method).toBe('PUT')
    const [stored] = [...conversations.values()]
    expect(stored!.body.messages[0].parts[0].name).toBe('omitted_media')
    expect(localStorage.getItem('h4b:conversation-id')).toMatch(/^conv_/)
    const second = await bot({ fetch })
    expect(second.conversation.threadId).toBe(first.conversation.threadId)
    expect(second.messages).toHaveLength(2)
  })

  it('sends the TTL and clears on reset()', async () => {
    const { fetch, conversations, calls } = server()
    const h4b = await bot({ fetch, retention: { ttlMinutes: 15 } })
    await h4b.ask('oi')
    await waitForIdle(h4b)
    expect([...conversations.values()][0]!.retention).toBe('15')
    await h4b.reset()
    expect(calls.at(-1)!.method).toBe('DELETE')
    expect(conversations.size).toBe(0)
  })

  it("the 'tab' retention keys the conversation by tab, and end users can switch", async () => {
    const { fetch, conversations } = server()
    const h4b = await bot({ fetch, userChoices: ['tab'] })
    const retention = h4b.get('retention')!
    expect(retention).toMatchObject({ current: 'server', location: 'server', encrypted: false, choices: ['server', 'tab'] })
    await h4b.ask('oi')
    await waitForIdle(h4b)
    const before = localStorage.getItem('h4b:conversation-id')
    await retention.set('tab')
    expect(conversations.has(before!)).toBe(false) // deleted under the old id
    const tabId = sessionStorage.getItem('h4b:conversation-id')!
    expect(conversations.get(tabId)).toMatchObject({ retention: 'tab' })
    // Another tab (fresh sessionStorage) can't reach it.
    sessionStorage.clear()
    expect((await bot({ fetch, userChoices: ['tab'] })).messages).toEqual([])
    await expect(retention.set('key')).rejects.toThrow(/not one of the choices/)
  })

  it('reports server errors without breaking', async () => {
    const fetch = vi.fn(async () => new Response('down', { status: 500 })) as unknown as typeof globalThis.fetch
    const h4b = createH4B({ plugins: [storageBackend({ url: '/x', fetch })] })
    const errors: unknown[] = []
    h4b.on('error', ({ source }) => errors.push(source))
    await h4b.start()
    expect(errors).toEqual(['storage'])
    expect(h4b.messages).toEqual([])
  })
})

describe('storage-backend with consent', () => {
  const consented = (fetch: typeof globalThis.fetch, initial: Record<string, boolean>) => {
    const h4b = createH4B({
      consent: { channel: false, initial },
      plugins: [storageBackend({ url: '/api/h4b/conversation', fetch })],
    })
    h4b.provide('transport', echo)
    return h4b.start()
  }
  const consentHeaders = (fetch: any) =>
    (fetch.mock.calls as [string, RequestInit][]).map(([, init]) => (init.headers as Record<string, string>)['x-h4b-consent'])

  it('sends the granted purposes and saves again when they change', async () => {
    const { fetch, calls } = server()
    const h4b = await consented(fetch, { persistence: true, review: false })
    await h4b.ask('oi')
    await waitForIdle(h4b)
    expect(consentHeaders(fetch).at(-1)).toBe('persistence')
    const puts = calls.filter((c) => c.method === 'PUT').length
    await h4b.consent.set({ review: true })
    await waitForIdle(h4b)
    await h4b.persist()
    expect(calls.filter((c) => c.method === 'PUT').length).toBeGreaterThan(puts)
    expect(consentHeaders(fetch).at(-1)).toBe('persistence,review')
  })

  it('on revoke, deletes the conversation on the server and forgets its id, keeping it on screen', async () => {
    const { fetch, conversations, calls } = server()
    const h4b = await consented(fetch, { persistence: true })
    await h4b.ask('oi')
    await waitForIdle(h4b)
    await h4b.persist()
    expect(conversations.size).toBe(1)
    await h4b.consent.set({ persistence: false })
    expect(calls.at(-1)!.method).toBe('DELETE')
    expect(conversations.size).toBe(0)
    expect(localStorage.getItem('h4b:conversation-id')).toBeNull()
    expect(h4b.messages).toHaveLength(2)
  })

  it('never mints a conversation id just to erase', async () => {
    const { fetch, calls } = server()
    await consented(fetch, { persistence: false })
    expect(calls).toHaveLength(0)
    expect(localStorage.getItem('h4b:conversation-id')).toBeNull()
  })
})
