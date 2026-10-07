import { createH4B, textOf, type Message, type Transport, type TurnRequest } from '@handsforbots/core'
import { describe, expect, it, vi } from 'vitest'
import { groupTurns, httpSummarizer, localSummary, memory, type MemoryOptions } from '../src/index.js'

/** Echoes the user's text and records what each request carried. */
function recorder() {
  const requests: TurnRequest[] = []
  const transport: Transport = {
    name: 'rec',
    async *run(request) {
      requests.push(request)
      const last = request.messages.filter((m) => m.role === 'user').at(-1)
      yield { type: 'message.delta', messageId: `m-${request.turnId}`, delta: `eco ${last ? textOf(last) : ''}` }
    },
  }
  return { requests, transport }
}

const userTexts = (messages: Message[]) => messages.filter((m) => m.role === 'user').map((m) => textOf(m))
const summaryOf = (request: TurnRequest) => request.context.find((s) => s.key === 'memory.summary')

async function bot(memoryOption?: MemoryOptions | false, plugins: any[] = []) {
  const { requests, transport } = recorder()
  const h4b = await createH4B({ memory: memoryOption, plugins }).start()
  h4b.provide('transport', transport)
  const say = async (...texts: string[]) => {
    for (const text of texts) {
      await h4b.ask(text)
      await h4b.get('memory')?.maintain()
    }
  }
  return { h4b, requests, say }
}

describe('memory', () => {
  it('is mounted by default: 20 turns sent, 100 kept, local compaction', async () => {
    const { h4b } = await bot()
    expect(h4b.get('memory')!.options).toEqual({ send: 20, keep: 100, compact: 'local', maxSummaryChars: 4000 })
  })

  it('sends only the last turns, with a summary of the older ones', async () => {
    const { h4b, requests, say } = await bot({ send: 2 })
    await say('a', 'b', 'c', 'd')
    const last = requests.at(-1)!
    expect(userTexts(last.messages)).toEqual(['c', 'd'])
    expect(textOf(summaryOf(last)!.parts)).toContain('User: a\nAssistant: eco a\nUser: b')
    expect(h4b.messages).toHaveLength(8) // the history itself is untouched (keep: 100)
    expect(h4b.get('memory')!.summary).toBe('User: a\nAssistant: eco a\nUser: b\nAssistant: eco b')
  })

  it('without compaction, older turns are simply not sent', async () => {
    const { requests, say } = await bot({ send: 2, compact: false })
    await say('a', 'b', 'c')
    expect(userTexts(requests.at(-1)!.messages)).toEqual(['b', 'c'])
    expect(summaryOf(requests.at(-1)!)).toBeUndefined()
  })

  it("'none' sends only the current turn, including its action round trips", async () => {
    let round = 0
    const h4b = await createH4B({ memory: { send: 'none' } }).start()
    h4b.actions.register({ name: 'ping', description: 'ping', handler: () => 'pong' })
    const seen: string[][] = []
    h4b.provide('transport', {
      name: 'tool',
      async *run(request) {
        seen.push(request.messages.map((m) => m.role))
        if (round++ % 2 === 0) yield { type: 'action.call', callId: `c${round}`, name: 'ping', args: {} }
        else yield { type: 'message.delta', messageId: `m${round}`, delta: 'done' }
      },
    })
    await h4b.ask('one')
    await h4b.ask('two')
    expect(seen).toEqual([['user'], ['user', 'assistant', 'tool'], ['user'], ['user', 'assistant', 'tool']])
  })

  it("'all' sends the whole history", async () => {
    const { requests, say } = await bot({ send: 'all' })
    await say('a', 'b', 'c')
    expect(userTexts(requests.at(-1)!.messages)).toEqual(['a', 'b', 'c'])
  })

  it('keeps at most `keep` turns, removing only what is already summarized', async () => {
    const changed = vi.fn()
    const { h4b, requests, say } = await bot({ send: 1, keep: 2 })
    h4b.on('memory.changed', changed)
    await say('a', 'b', 'c', 'd')
    expect(userTexts(h4b.messages)).toEqual(['c', 'd'])
    expect(h4b.get('memory')!.summary).toContain('User: c')
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ removed: 2 }))
    expect(userTexts(requests.at(-1)!.messages)).toEqual(['d'])
  })

  it('keep is never below send', async () => {
    const { h4b } = await bot({ send: 5, keep: 2 })
    expect(h4b.get('memory')!.options.keep).toBe(5)
  })

  it('uses a summarizer, and falls back to the local summary when it fails', async () => {
    const summarize = vi.fn(async ({ previous, turns }: { previous?: string; turns: Message[][] }) =>
      `${previous ?? ''}[${turns.map((t) => userTexts(t).join()).join('|')}]`,
    )
    const { h4b, say } = await bot({ send: 1, compact: summarize })
    await say('a', 'b', 'c')
    expect(summarize).toHaveBeenCalledTimes(2)
    expect(h4b.get('memory')!.summary).toBe('[a][b]')

    const errors: string[] = []
    const failing = await bot({ send: 1, compact: () => Promise.reject(new Error('down')) })
    failing.h4b.on('error', ({ source }) => errors.push(source))
    await failing.say('x', 'y')
    expect(errors).toEqual(['memory'])
    expect(failing.h4b.get('memory')!.summary).toBe('User: x\nAssistant: eco x')
  })

  it('waits for the summary before sending, and never trims what is not summarized', async () => {
    let release!: (summary: string) => void
    const { h4b, requests } = await bot({
      send: 1,
      keep: 1,
      compact: () => new Promise<string>((r) => (release = r)),
    })
    await h4b.ask('a')
    const asking = h4b.ask('b')
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    expect(userTexts(h4b.messages)).toEqual(['a', 'b']) // still summarizing 'a'
    expect(requests).toHaveLength(1)
    release('resumo')
    await asking
    expect(userTexts(requests.at(-1)!.messages)).toEqual(['b'])
    expect(textOf(summaryOf(requests.at(-1)!)!.parts)).toContain('resumo')
    expect(userTexts(h4b.messages)).toEqual(['b'])
  })

  it('caps the summary, dropping the oldest lines', async () => {
    const { h4b, say } = await bot({ send: 1, maxSummaryChars: 40 })
    await say('primeira', 'segunda', 'terceira', 'quarta')
    const summary = h4b.get('memory')!.summary!
    expect(summary.length).toBeLessThanOrEqual(40)
    expect(summary.startsWith('…\n')).toBe(true)
    expect(summary).toContain('terceira')
  })

  it('reset() forgets the summary', async () => {
    const { h4b, requests, say } = await bot({ send: 1 })
    await say('a', 'b')
    await h4b.reset()
    await say('c')
    expect(h4b.get('memory')!.summary).toBeUndefined()
    expect(summaryOf(requests.at(-1)!)).toBeUndefined()
  })

  it('can be unplugged or replaced', async () => {
    const off = await bot(false)
    expect(off.h4b.get('memory')).toBeUndefined()
    await off.say('a', 'b')
    expect(userTexts(off.requests.at(-1)!.messages)).toEqual(['a', 'b'])

    const custom = await bot(undefined, [memory({ send: 7 })])
    expect(custom.h4b.get('memory')!.options.send).toBe(7)
  })

  it('a direct action is a turn of its own', async () => {
    const { h4b, say } = await bot()
    h4b.actions.register({ name: 'filter', description: 'filter', exposeTo: ['user'], handler: () => 'ok' })
    await say('a')
    await h4b.runAction('filter', { x: 1 })
    expect(groupTurns(h4b.messages).map((t) => t.map((m) => m.role))).toEqual([
      ['user', 'assistant'],
      ['assistant', 'tool'],
    ])
    expect(localSummary(undefined, groupTurns(h4b.messages))).toBe(
      'User: a\nAssistant: eco a\nAction filter({"x":1})\n  → filter: ok (ok)',
    )
  })

  it('groups messages saved without turnId by user message', () => {
    const m = (id: string, role: 'user' | 'assistant'): Message =>
      ({ id, role, parts: [{ type: 'text', text: id }], createdAt: 0, ...(role === 'user' ? { modality: 'text', source: 'x' } : {}) }) as Message
    expect(groupTurns([m('1', 'assistant'), m('2', 'user'), m('3', 'assistant'), m('4', 'user')]).map((t) => t.map((x) => x.id))).toEqual([
      ['1'],
      ['2', '3'],
      ['4'],
    ])
  })

  it('httpSummarizer posts the turns to your backend', async () => {
    const fetch = vi.fn(async () => Response.json({ summary: 'resumo' }))
    const summarize = httpSummarizer({ url: '/api/summary', fetch: fetch as unknown as typeof globalThis.fetch })
    const turn: Message[] = [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'oi' }], modality: 'text', source: 'x', createdAt: 0 }]
    expect(await summarize({ previous: 'antes', turns: [turn] })).toBe('resumo')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/summary')
    expect(JSON.parse(init.body as string)).toEqual({ previous: 'antes', messages: turn })
  })
})
