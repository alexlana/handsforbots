import { describe, expect, it, vi } from 'vitest'
import { createH4B, definePlugin, textOf, type Stimulus, type Transport, type TurnRequest } from '../src/index.js'

const echo = (requests: TurnRequest[] = []): Transport => ({
  name: 'echo',
  async *run(request) {
    requests.push(request)
    await new Promise((r) => setTimeout(r, 1))
    yield { type: 'message.delta', messageId: `a-${request.turnId}`, delta: `eco: ${textOf(request.messages.at(-1)!)}` }
  },
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('awaitable host API', () => {
  it('ask() resolves with the turn status and the messages it produced', async () => {
    const h4b = createH4B()
    h4b.provide('transport', echo())
    const result = await h4b.ask('olá')
    expect(result.status.phase).toBe('done')
    expect(result.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(textOf(result.messages[1]!)).toBe('eco: olá')
  })

  it('ask() waits for queued turns in order', async () => {
    const h4b = createH4B()
    h4b.provide('transport', echo())
    const [a, b] = await Promise.all([h4b.ask('1'), h4b.ask('2')])
    expect(textOf(a.messages[1]!)).toBe('eco: 1')
    expect(textOf(b.messages[1]!)).toBe('eco: 2')
  })

  it('when() resolves on a matching event and supports timeouts', async () => {
    const h4b = createH4B()
    const waiting = h4b.when('context.changed', (ctx) => ctx.length === 1)
    h4b.signal({ kind: 'context', modality: 'sensor', parts: [], source: 'gps' })
    expect(await waiting).toHaveLength(1)
    await expect(h4b.when('signal', () => true, { timeout: 5 })).rejects.toThrow('Timed out')
  })
})

describe('notifications', () => {
  it('never wait for async listeners and report their rejections', async () => {
    const onError = vi.fn()
    const h4b = createH4B({ onError })
    h4b.provide('transport', echo())
    let slowDone = false
    h4b.on('turn.status', async () => {
      await sleep(30)
      slowDone = true
    })
    h4b.on('signal', async () => {
      throw new Error('async boom')
    })
    const result = await h4b.ask('x')
    expect(result.status.phase).toBe('done')
    expect(slowDone).toBe(false)
    await sleep(0)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'async boom' }), 'listener:signal')
  })
})

describe('interceptors', () => {
  it('can transform signals (sync) and redact requests (async) before the transport', async () => {
    const requests: TurnRequest[] = []
    const h4b = createH4B()
    h4b.provide('transport', echo(requests))
    h4b.intercept('signal.before', (s) => ({ ...s, parts: [{ type: 'text', text: textOf(s.parts).trim() }] }))
    h4b.intercept('request.before', async (req) => {
      await sleep(1)
      return {
        ...req,
        messages: req.messages.map((m) =>
          m.role === 'user' ? { ...m, parts: [{ type: 'text' as const, text: textOf(m).replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/, '[cpf]') }] } : m,
        ),
      }
    })
    const result = await h4b.ask('  meu cpf é 123.456.789-00  ')
    expect(textOf(requests[0]!.messages[0]!)).toBe('meu cpf é [cpf]')
    // History keeps what the user actually said (after signal.before), the backend saw the redacted one.
    expect(textOf(result.messages[0]!)).toBe('meu cpf é 123.456.789-00')
  })

  it('drops signals and stimuli when an interceptor returns null', async () => {
    const h4b = createH4B()
    h4b.provide('transport', {
      name: 't',
      async *run() {
        yield { type: 'ui.effect', name: 'confetti' } satisfies Stimulus
        yield { type: 'message.delta', messageId: 'm', delta: 'ok' } satisfies Stimulus
      },
    })
    h4b.intercept('signal.before', (s) => (textOf(s.parts) === 'spam' ? null : s))
    h4b.intercept('stimulus.before', (s) => (s.type === 'ui.effect' ? null : undefined))
    const effects: string[] = []
    h4b.on('stimulus', ({ stimulus }) => void effects.push(stimulus.type))

    const dropped = await h4b.ask('spam')
    expect(dropped.status.phase).toBe('aborted')
    await h4b.ask('oi')
    expect(effects).toEqual(['message.delta'])
  })

  it('can veto actions for any origin, in priority order', async () => {
    const order: string[] = []
    const h4b = createH4B({ actions: [{ name: 'pay', description: 'Pay', handler: () => 'paid' }] })
    h4b.intercept('action.before', async (inv) => {
      order.push('second')
      return inv.origin === 'agent' ? null : inv
    }, 10)
    h4b.intercept('action.before', () => void order.push('first'), 0)
    await expect(h4b.actions.invoke('pay', {}, { origin: 'agent', callId: '1' })).rejects.toThrow('cancelled')
    expect(await h4b.actions.invoke('pay', {}, { origin: 'user', callId: '2' })).toBe('paid')
    expect(order).toEqual(['first', 'second', 'first', 'second'])
  })

  it('are scoped to the plugin that registered them', async () => {
    const h4b = createH4B()
    h4b.provide('transport', echo())
    const dispose = await h4b.use(
      definePlugin({ name: 'blocker', apply: (ctx) => void ctx.intercept('signal.before', () => null) })(),
    )
    expect((await h4b.ask('a')).status.phase).toBe('aborted')
    await dispose()
    expect((await h4b.ask('b')).status.phase).toBe('done')
  })
})

describe('push (stimuli outside a turn)', () => {
  it('applies pushed stimuli in order with turns', async () => {
    const h4b = createH4B()
    h4b.provide('transport', echo())
    const turn = h4b.ask('primeiro')
    const pushed = h4b.push([
      { type: 'message.start', messageId: 'p1' },
      { type: 'message.delta', messageId: 'p1', delta: 'Seu relatório ficou pronto.' },
      { type: 'message.end', messageId: 'p1' },
    ])
    await Promise.all([turn, pushed])
    expect(h4b.messages.map((m) => `${m.role}:${m.route}`)).toEqual(['user:transport', 'assistant:transport', 'assistant:push'])
    expect(textOf(h4b.messages.at(-1)!)).toBe('Seu relatório ficou pronto.')
  })

  it('connects transports that support server push', async () => {
    let deliver: ((s: Stimulus[]) => void) | undefined
    const disconnect = vi.fn()
    const h4b = createH4B()
    const remove = h4b.provide('transport', {
      name: 'socket',
      async *run() {},
      connect(d) {
        deliver = d
        return disconnect
      },
    })
    const applied = h4b.when('messages.changed', (m) => m.length === 1)
    deliver!([{ type: 'message.delta', messageId: 'x', delta: 'notificação' }])
    await applied
    expect(textOf(h4b.messages[0]!)).toBe('notificação')
    remove()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})

describe('runAction', () => {
  it('runs an action through the queue and records who asked for it', async () => {
    const h4b = createH4B({
      actions: [
        { name: 'zoom', description: 'Zoom', handler: ({ level }: { level: number }) => level * 2 },
        { name: 'boom', description: 'Fails', handler: () => { throw new Error('quebrou') } },
      ],
    })
    const statuses: string[] = []
    h4b.on('turn.status', (s) => void statuses.push(`${s.phase}:${s.route}`))

    expect(await h4b.runAction('zoom', { level: 2 }, { origin: 'agent' })).toEqual({ result: 4 })
    expect(await h4b.runAction('boom')).toEqual({ error: 'quebrou' })
    expect(h4b.messages.map((m) => `${m.role}:${m.route}`)).toEqual([
      'assistant:agent',
      'tool:agent',
      'assistant:direct',
      'tool:direct',
    ])
    expect(statuses).toEqual(['acting:agent', 'done:agent', 'acting:direct', 'error:direct'])
  })
})
