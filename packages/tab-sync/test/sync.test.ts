import { createH4B, textOf, type Transport } from '@handsforbots/core'
import { describe, expect, it } from 'vitest'
import { tabSync, type ChannelLike } from '../src/index.js'

/** In-memory BroadcastChannel: delivers to every other channel with the same name. */
function bus() {
  const channels = new Set<{ name: string; listeners: Set<(e: { data: any }) => void> }>()
  return (name: string): ChannelLike => {
    const self = { name, listeners: new Set<(e: { data: any }) => void>() }
    channels.add(self)
    return {
      postMessage: (data) => {
        for (const other of channels) {
          if (other !== self && other.name === name) other.listeners.forEach((l) => l({ data: structuredClone(data) }))
        }
      },
      addEventListener: (_t, l) => void self.listeners.add(l),
      removeEventListener: (_t, l) => void self.listeners.delete(l),
      close: () => void channels.delete(self),
    }
  }
}

const echo: Transport = {
  name: 'echo',
  async *run(request) {
    yield { type: 'message.delta', messageId: `m-${request.turnId}`, delta: `eco ${textOf(request.messages.at(-1)!)}` }
  },
}

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms))

/** Polls until `check` passes (or rethrows its last failure after the deadline). */
async function eventually(check: () => void, timeout = 3000) {
  const deadline = Date.now() + timeout
  for (;;) {
    try {
      return check()
    } catch (error) {
      if (Date.now() > deadline) throw error
      await wait(10)
    }
  }
}

describe('tab-sync', () => {
  it('mirrors the conversation to other tabs', async () => {
    const createChannel = bus()
    const tabA = await createH4B({ plugins: [tabSync({ createChannel, throttleMs: 0 })] }).start()
    const tabB = await createH4B({ plugins: [tabSync({ createChannel, throttleMs: 0 })] }).start()
    tabA.provide('transport', echo)
    await tabA.ask('oi')
    await eventually(() => expect(tabB.messages.map((m) => textOf(m as any))).toEqual(['oi', 'eco oi']))
    expect(tabB.conversation.threadId).toBe(tabA.conversation.threadId)
  })

  it('merges histories of the same thread, deferring while a turn runs', async () => {
    const createChannel = bus()
    const tabA = await createH4B({ threadId: 't1', plugins: [tabSync({ createChannel, throttleMs: 0 })] }).start()
    const tabB = await createH4B({ threadId: 't1', plugins: [tabSync({ createChannel, throttleMs: 0 })] }).start()
    let release!: () => void
    tabB.provide('transport', {
      name: 'slow',
      async *run() {
        await new Promise<void>((r) => (release = r))
        yield { type: 'message.delta', messageId: 'b', delta: 'resposta B' }
      },
    })
    tabA.provide('transport', echo)
    const turnB = tabB.ask('pergunta B')
    await wait(5)
    await tabA.ask('pergunta A')
    await wait()
    // B is busy: it keeps its own state for now.
    expect(tabB.messages.map((m) => textOf(m as any))).toEqual(['pergunta B'])
    release()
    await turnB
    const expected = ['pergunta B', 'pergunta A', 'eco pergunta A', 'resposta B']
    await eventually(() => {
      expect(tabA.messages.map((m) => textOf(m as any))).toEqual(expected)
      expect(tabB.messages.map((m) => textOf(m as any))).toEqual(expected)
    })
  })

  it('adopts another thread (e.g. reset in another tab)', async () => {
    const createChannel = bus()
    const tabA = await createH4B({ threadId: 'old', plugins: [tabSync({ createChannel, throttleMs: 0 })] }).start()
    const tabB = await createH4B({ threadId: 'old', plugins: [tabSync({ createChannel, throttleMs: 0 })] }).start()
    tabA.provide('transport', echo)
    await tabA.ask('oi')
    await wait()
    await tabA.reset('new')
    await tabA.ask('de novo')
    await eventually(() => {
      expect(tabB.conversation.threadId).toBe('new')
      expect(tabB.messages.map((m) => textOf(m as any))).toEqual(['de novo', 'eco de novo'])
    })
  })

  it('only syncs tabs on the same channel', async () => {
    const createChannel = bus()
    const a = await createH4B({ plugins: [tabSync({ createChannel, channel: 'shop', throttleMs: 0 })] }).start()
    const b = await createH4B({ plugins: [tabSync({ createChannel, channel: 'admin', throttleMs: 0 })] }).start()
    a.provide('transport', echo)
    await a.ask('oi')
    await wait()
    expect(b.messages).toEqual([])
  })
})
