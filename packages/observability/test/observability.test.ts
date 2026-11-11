import { createH4B, type Transport } from '@handsforbots/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { observability } from '../src/index.js'

const transport: Transport = {
  name: 't',
  async *run() {
    yield { type: 'message.start', messageId: 'a' }
    yield { type: 'message.delta', messageId: 'a', delta: 'secreto' }
    yield { type: 'message.end', messageId: 'a' }
  },
}

describe('observability plugin', () => {
  it('records turns, routes and actions without message content by default', async () => {
    const h4b = await createH4B({
      plugins: [observability({ environment: 'test' })],
      actions: [{ name: 'ping', description: 'Ping', handler: () => 'pong' }],
    }).start()
    h4b.provide('transport', transport)
    await h4b.ask('meu segredo é zebra-quantica')
    await h4b.runAction('ping', {}, { origin: 'agent' })

    const obs = h4b.get('observability')!
    const names = obs.getTimeline().map((e) => e.name)
    expect(names).toEqual(
      expect.arrayContaining(['turn.started', 'route.transport.start', 'stimulus.message.end', 'route.transport.end', 'turn.done', 'signal.text', 'action.invoked', 'route.agent.start']),
    )
    expect(names).not.toContain('stimulus.message.delta')
    expect(JSON.stringify(obs.getTimeline())).not.toContain('zebra-quantica')
    const phases = obs.getMetrics().filter((m) => m.name.includes('phase'))
    expect(phases.length).toBeGreaterThan(0)
  })

  it('can include content and exposes trace headers for transports', async () => {
    const h4b = await createH4B({ plugins: [observability({ includeContent: true })] }).start()
    h4b.provide('transport', transport)
    await h4b.ask('olá')
    const obs = h4b.get('observability')!
    expect(JSON.stringify(obs.getTimeline())).toContain('olá')
    expect(typeof obs.getTraceHeaders()).toBe('object')
  })
})

describe('perceived latency', () => {
  it('records time to first visible response and turn duration per route', async () => {
    const h4b = await createH4B({
      plugins: [observability()],
      actions: [{ name: 'go', description: 'Go', handler: () => 1, describeResult: () => 'feito' }],
    }).start()
    h4b.provide('transport', {
      name: 'slow',
      async *run() {
        await new Promise((r) => setTimeout(r, 40))
        yield { type: 'message.delta', messageId: 'a', delta: 'oi' }
      },
    })
    h4b.addMatcher({ name: 'm', match: (s) => ((s.parts[0] as any).text === '/go' ? { action: 'go' } : null) })
    await h4b.ask('olá')
    await h4b.ask('/go')
    const metrics = h4b.get('observability')!.getMetrics().filter((m) => m.name === 'h4b_first_response_ms')
    const byRoute = Object.fromEntries(metrics.map((m) => [m.labels?.route, m.value]))
    expect(byRoute.transport).toBeGreaterThanOrEqual(35)
    expect(byRoute.direct).toBeLessThan(35)
    expect(h4b.get('observability')!.getMetrics().some((m) => m.name === 'h4b_turn_duration_ms' && m.labels?.route === 'direct')).toBe(true)
  })
})

describe('voice events', () => {
  it('records spoken chunks and the stage of voice errors, without transcripts by default', async () => {
    const h4b = await createH4B({ plugins: [observability()] }).start()
    const emit = h4b.emit.bind(h4b) as (event: string, payload: unknown) => void
    emit('voice.speech', { phase: 'start', provider: 'webspeech', chars: 12 })
    emit('voice.speech', { phase: 'error', provider: 'webspeech', code: 'synthesis-failed', message: 'never started' })
    emit('voice.decision', { kind: 'ignore', text: 'aham-confidencial', reason: 'backchannel' })
    h4b.emit('error', {
      error: Object.assign(new Error('speechSynthesis: not-allowed'), { code: 'output-blocked', stage: 'speak' }),
      source: 'voice:tts:webspeech',
    })

    const timeline = h4b.get('observability')!.getTimeline()
    expect(timeline.map((e) => e.name)).toEqual(
      expect.arrayContaining(['voice.speech.start', 'voice.speech.error', 'voice.decision', 'kernel.error']),
    )
    const json = JSON.stringify(timeline)
    expect(json).toContain('synthesis-failed')
    expect(json).toContain('"stage":"speak"')
    expect(json).toContain('output-blocked')
    expect(json).not.toContain('aham-confidencial')
  })
})

describe('cue events', () => {
  it('records cue.changed and cue.repeat with their codes', async () => {
    const h4b = await createH4B({ plugins: [observability()] }).start()
    const emit = h4b.emit.bind(h4b) as (event: string, payload: unknown) => void
    emit('cue.changed', { channel: 'tone', value: 'confuso', streak: 2, count: 2, level: 2, from: 'backend', messageId: 'm1' })
    emit('cue.repeat', { channel: 'tone', value: 'serio', level: 1, streak: 1, count: 1, replaced: 'ofendido', messageId: 'm2' })
    const timeline = h4b.get('observability')!.getTimeline()
    expect(timeline.map((e) => e.name)).toEqual(expect.arrayContaining(['cue.changed', 'cue.repeat']))
    const json = JSON.stringify(timeline)
    expect(json).toContain('"value":"confuso"')
    expect(json).toContain('"replaced":"ofendido"')
  })
})

describe('speech provider trace', () => {
  it('records voice.tts events by name, with the worker number', async () => {
    const h4b = await createH4B({ plugins: [observability()] }).start()
    const emit = h4b.emit.bind(h4b) as (event: string, payload: unknown) => void
    emit('voice.tts', { provider: 'piper', event: 'worker.init', worker: 3, attempt: 1 })
    emit('voice.tts', { provider: 'piper', event: 'load.done', ms: 900 })
    const timeline = h4b.get('observability')!.getTimeline()
    expect(timeline.map((e) => e.name)).toEqual(expect.arrayContaining(['voice.tts.worker.init', 'voice.tts.load.done']))
    expect(JSON.stringify(timeline)).toContain('"worker":3')
  })

  // Node only has a global `navigator` from 21 on: stub it so the test runs on Node 20 too.
  afterEach(() => vi.unstubAllGlobals())

  it('records the browser once, at start', async () => {
    vi.stubGlobal('navigator', { userAgent: 'TestAgent/1.0', language: 'pt-BR' })
    const h4b = await createH4B({ plugins: [observability()] }).start()
    const events = h4b.get('observability')!.getTimeline().filter((e) => e.name === 'client.environment')
    expect(events).toHaveLength(1)
    expect(JSON.stringify(events[0])).toContain('TestAgent/1.0')
    expect(JSON.stringify(events[0])).toContain('pt-BR')
  })

  it('records no browser where there is no navigator', async () => {
    vi.stubGlobal('navigator', undefined)
    const h4b = await createH4B({ plugins: [observability()] }).start()
    expect(h4b.get('observability')!.getTimeline().some((e) => e.name === 'client.environment')).toBe(false)
  })
})
