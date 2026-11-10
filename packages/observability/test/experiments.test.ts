import { createH4B, withConsent, type Transport } from '@handsforbots/core'
import { describe, expect, it } from 'vitest'
import { H4B_ENGAGED_COUNTER, H4B_EXPOSED_COUNTER, observability } from '../src/index.js'
import { readConversationAttributes } from '../src/server.js'

const transport: Transport = {
  name: 't',
  async *run() {
    yield { type: 'message.delta', messageId: 'a', delta: 'oi' }
  },
}

const counters = (h4b: ReturnType<typeof createH4B>, name: string) =>
  h4b.get('observability')!.getMetrics().filter((m) => m.name === name)

const rules = [{ id: 'test', regions: ['*'], purposes: { analytics: { default: 'pending' as const } } }]

describe('conversation attributes', () => {
  it('go on events and in the baggage header, and follow the conversation', async () => {
    const h4b = await createH4B({ plugins: [observability({ environment: 'test' })] }).start()
    h4b.provide('transport', transport)
    const obs = h4b.get('observability')!
    h4b.setConversationAttributes({ 'greeting.kind': 'directed', 'greeting.index': 3 })
    expect(obs.getTraceHeaders().baggage).toBe('greeting.kind=directed,greeting.index=3')
    await h4b.ask('olá')
    const turn = obs.getTimeline().find((e) => e.name === 'turn.started')
    expect(turn?.attributes).toEqual({ 'greeting.kind': 'directed', 'greeting.index': 3 })

    await h4b.reset()
    expect(obs.getAttributes()).toEqual({})
    expect(obs.getTraceHeaders().baggage).toBeUndefined()
  })

  it('picks up attributes set before the plugin mounted', async () => {
    const h4b = await createH4B({ consent: { rules }, plugins: [withConsent(observability(), 'analytics')] }).start()
    h4b.setConversationAttributes({ 'greeting.kind': 'open' })
    expect(h4b.get('observability')).toBeUndefined()
    await h4b.consent.set({ analytics: 'granted' })
    expect(h4b.get('observability')!.getTraceHeaders().baggage).toBe('greeting.kind=open')
  })
})

describe('exposures and engagement', () => {
  it('records an exposure as an event and a counter, and the first visitor turn once', async () => {
    const h4b = await createH4B({ plugins: [observability({ environment: 'test', sampleRate: 0 })] }).start()
    h4b.provide('transport', transport)
    h4b.setConversationAttributes({ 'greeting.kind': 'directed' })
    h4b.expose('greeting')
    const obs = h4b.get('observability')!
    // Counters are never sampled out, even with sampleRate 0.
    expect(counters(h4b, H4B_EXPOSED_COUNTER).map((m) => m.labels)).toEqual([
      { environment: 'test', experiment: 'greeting', 'greeting.kind': 'directed' },
    ])
    await h4b.ask('olá')
    await h4b.ask('de novo')
    h4b.signal({ modality: 'gui-event', source: 'gui', parts: [{ type: 'text', text: 'idle' }], meta: { reason: 'idle' } })
    await h4b.when('turn.status', (s) => s.phase === 'done')
    expect(counters(h4b, H4B_ENGAGED_COUNTER).map((m) => m.labels)).toEqual([{ environment: 'test', 'greeting.kind': 'directed' }])
    expect(obs.getMetrics().some((m) => m.name === H4B_EXPOSED_COUNTER)).toBe(true)
  })

  it('does not count engagement for an idle nudge', async () => {
    const h4b = await createH4B({ plugins: [observability()] }).start()
    h4b.provide('transport', transport)
    h4b.signal({ modality: 'gui-event', source: 'gui', parts: [{ type: 'text', text: 'still there?' }], meta: { reason: 'idle' } })
    await h4b.when('turn.status', (s) => s.phase === 'done')
    expect(counters(h4b, H4B_ENGAGED_COUNTER)).toEqual([])
  })

  it('records exposures and engagement from before analytics was granted, once', async () => {
    const h4b = await createH4B({ consent: { rules }, plugins: [withConsent(observability(), 'analytics')] }).start()
    h4b.provide('transport', transport)
    h4b.setConversationAttributes({ 'greeting.kind': 'open' })
    h4b.expose('greeting')
    await h4b.ask('olá')
    await h4b.consent.set({ analytics: 'granted' })
    const obs = h4b.get('observability')!
    const exposed = obs.getTimeline().filter((e) => e.name === 'experiment.exposed')
    expect(exposed).toHaveLength(1)
    expect(JSON.parse((exposed[0]!.payloadSummary as { preview: string }).preview)).toEqual({
      experiment: 'greeting',
      'greeting.kind': 'open',
      late: true,
    })
    expect(counters(h4b, H4B_EXPOSED_COUNTER)).toHaveLength(1)
    expect(counters(h4b, H4B_ENGAGED_COUNTER)).toHaveLength(1)

    // Revoked and granted again: a new plugin instance, nothing counted twice.
    await h4b.consent.set({ analytics: 'denied' })
    await h4b.consent.set({ analytics: 'granted' })
    expect(counters(h4b, H4B_EXPOSED_COUNTER)).toHaveLength(0)
    expect(counters(h4b, H4B_ENGAGED_COUNTER)).toHaveLength(0)
  })

  it('without analytics nothing is recorded and nothing leaves', async () => {
    const h4b = await createH4B({ consent: { rules }, plugins: [withConsent(observability(), 'analytics')] }).start()
    h4b.setConversationAttributes({ 'greeting.kind': 'open' })
    h4b.expose('greeting')
    expect(h4b.get('observability')).toBeUndefined()
    await h4b.consent.set({ analytics: 'denied' })
    expect(h4b.get('observability')).toBeUndefined()
  })
})

describe('readConversationAttributes', () => {
  it('keeps allowed keys and code-shaped values, converting types when asked', () => {
    const headers = {
      baggage: 'greeting.kind=directed,greeting.index=3,flag=true,other=x,long=' + 'a'.repeat(70) + ',text=two%20words',
    }
    expect(readConversationAttributes(headers, { allow: ['greeting.kind', 'greeting.index', 'text', 'long'] })).toEqual({
      'greeting.kind': 'directed',
      'greeting.index': '3',
    })
    expect(
      readConversationAttributes(new Headers(headers), {
        allow: { 'greeting.kind': 'string', 'greeting.index': 'number', flag: 'boolean', other: 'number' },
      }),
    ).toEqual({ 'greeting.kind': 'directed', 'greeting.index': 3, flag: true })
    expect(readConversationAttributes(undefined, { allow: ['a'] })).toEqual({})
    expect(readConversationAttributes('__proto__=x,a=1', { allow: ['a', '__proto__'] })).toEqual({ a: '1' })
  })
})
