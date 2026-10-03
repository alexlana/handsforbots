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
