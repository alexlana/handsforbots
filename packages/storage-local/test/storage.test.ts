// @vitest-environment jsdom
import { createH4B, type Transport } from '@handsforbots/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { storageLocal } from '../src/index.js'

const echo: Transport = {
  name: 'echo',
  async *run() {
    yield { type: 'message.delta', messageId: `m${Math.random()}`, delta: 'ok' }
  },
}

async function bot(options = {}) {
  const h4b = createH4B({ plugins: [storageLocal(options)] })
  h4b.provide('transport', echo)
  return h4b.start()
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.useRealTimers()
})

describe('storage-local', () => {
  it('keeps the conversation across page loads', async () => {
    const first = await bot()
    await first.ask('oi')
    const second = await bot()
    expect(second.conversation.threadId).toBe(first.conversation.threadId)
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it('starts fresh after the inactivity timeout', async () => {
    vi.useFakeTimers()
    const first = await bot({ ttlMinutes: 30 })
    await first.ask('oi')
    vi.setSystemTime(Date.now() + 31 * 60_000)
    const second = await bot({ ttlMinutes: 30 })
    expect(second.messages).toEqual([])
    expect(localStorage.length).toBe(0)
  })

  it('can use sessionStorage, limits size and drops blobs', async () => {
    const h4b = await bot({ area: 'session', maxMessages: 2 })
    await h4b.ask({
      modality: 'image',
      source: 'camera',
      parts: [{ type: 'image', mimeType: 'image/png', source: { kind: 'blob', blob: new Blob(['x']) } }],
    })
    await h4b.ask('b')
    const stored = JSON.parse(sessionStorage.getItem('h4b:conversation')!)
    expect(stored.snapshot.messages).toHaveLength(2)
    expect(localStorage.length).toBe(0)
    const again = await bot({ area: 'session', maxMessages: 4 })
    await again.ask('c')
    const parts = JSON.parse(sessionStorage.getItem('h4b:conversation')!).snapshot.messages.flatMap((m: any) => m.parts ?? [])
    expect(parts.some((p: any) => p.name === 'omitted_media')).toBe(false) // first image fell out of the window
  })

  it('reset() clears what was stored', async () => {
    const h4b = await bot()
    await h4b.ask('oi')
    await h4b.reset()
    expect(localStorage.getItem('h4b:conversation')).toBeNull()
  })

  it('ignores corrupted data', async () => {
    localStorage.setItem('h4b:conversation', '{not json')
    const h4b = await bot()
    expect(h4b.messages).toEqual([])
  })
})
