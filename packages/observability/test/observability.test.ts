import { createH4B, type Transport } from '@handsforbots/core'
import { describe, expect, it } from 'vitest'
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
