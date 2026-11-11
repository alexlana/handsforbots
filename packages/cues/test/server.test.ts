import { createH4B, type Stimulus } from '@handsforbots/core'
import { reply, scriptedTransport, waitForIdle } from '@handsforbots/testkit'
import { toAguiInput } from '@handsforbots/transport-agui'
import { contextObject } from '@handsforbots/transport-http'
import { describe, expect, it } from 'vitest'
import { cues } from '../src/index.js'
import { readCuesState } from '../src/server.js'

const tone = {
  values: ['neutro', 'confuso', 'serio', 'ofendido'],
  default: 'neutro',
  repeat: { confuso: { levels: [2, 4] }, ofendido: { max: 1, by: 'count' as const, then: 'serio' } },
}
const effect = (value: unknown): Stimulus => ({ type: 'ui.effect', name: 'cues', value })

/** The request the backend gets on the second turn, after two offended replies. */
async function secondRequest() {
  const transport = scriptedTransport(() => [effect({ tone: 'ofendido' }), ...reply('...')])
  const h4b = await createH4B({ memory: false, plugins: [cues({ channels: { tone }, report: true })] }).start()
  h4b.provide('transport', transport)
  for (const text of ['a', 'b', 'c']) {
    await h4b.send(text)
    await waitForIdle(h4b)
  }
  return transport.requests[2]!
}

describe('readCuesState', () => {
  it('reads what the page reported, from AG-UI, from the HTTP transport and from signals', async () => {
    const request = await secondRequest()
    const expected = { tone: { value: 'serio', streak: 1, count: 1, level: 1, requested: 'ofendido' } }
    const agui = await toAguiInput(request)
    expect(readCuesState(agui.context, { tone })).toEqual(expected)
    expect(readCuesState(contextObject(request.context), { tone: tone.values })).toEqual(expected)
    expect(readCuesState(request.context, { tone })).toEqual(expected)
  })

  it('reads the value itself, as an object, a prefixed string or JSON', () => {
    const state = { tone: { value: 'confuso', streak: 3, count: 3, level: 2 } }
    expect(readCuesState(state, { tone })).toEqual(state)
    expect(readCuesState(`cues.state: ${JSON.stringify(state)}`, { tone })).toEqual(state)
    expect(readCuesState(JSON.stringify(state), { tone })).toEqual(state)
  })

  it('keeps only allowed channels and values, and integers in range', () => {
    const read = (entry: unknown) => readCuesState({ tone: entry, other: { value: 'x', streak: 1, count: 1, level: 1 } }, { tone })
    expect(read({ value: 'confuso', streak: 1, count: 1, level: 1 })).toEqual({ tone: { value: 'confuso', streak: 1, count: 1, level: 1 } })
    expect(read({ value: 'furioso', streak: 1, count: 1, level: 1 })).toEqual({})
    expect(read({ value: 'confuso', streak: -1, count: 1, level: 1 })).toEqual({})
    expect(read({ value: 'confuso', streak: 1, count: 1.5, level: 1 })).toEqual({})
    expect(read({ value: 'confuso', streak: 1, count: 1, level: 4 })).toEqual({}) // levels [2, 4] → at most 3
    expect(read({ value: 'serio', streak: 1, count: 1, level: 2 })).toEqual({}) // no levels → only 1
    expect(read({ value: 'confuso', streak: '1', count: 1, level: 1 })).toEqual({})
    expect(read({ value: 'serio', streak: 1, count: 1, level: 1, requested: '<script>' })).toEqual({
      tone: { value: 'serio', streak: 1, count: 1, level: 1 },
    })
    expect(readCuesState({ tone: { value: 'serio', streak: 1, count: 1, level: 5 } }, { tone: tone.values })).toEqual({
      tone: { value: 'serio', streak: 1, count: 1, level: 5 },
    })
    expect(readCuesState({ tone: { value: 'serio', streak: 99, count: 1, level: 1 } }, { tone }, { maxCount: 10 })).toEqual({})
  })

  it('never throws on malformed input', () => {
    for (const source of [undefined, null, 42, 'cues.state: {oops', [], [{ value: 'cues.state: [1]' }], { tone: null }, { 'cues.state': 'x' }]) {
      expect(readCuesState(source, { tone })).toEqual({})
    }
  })
})
