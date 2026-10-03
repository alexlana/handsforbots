import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  createH4B,
  definePlugin,
  textOf,
  type Message,
  type Stimulus,
  type Transport,
  type TurnRequest,
} from '../src/index.js'

/** Transport that replays scripted stimuli per round and records requests. */
function scripted(rounds: Stimulus[][]): Transport & { requests: TurnRequest[] } {
  const requests: TurnRequest[] = []
  let index = 0
  return {
    name: 'scripted',
    requests,
    async *run(request) {
      requests.push(structuredClone(request))
      for (const stimulus of rounds[index++] ?? []) yield stimulus
    },
  }
}

const transportPlugin = (transport: Transport) =>
  definePlugin({
    name: 'test-transport',
    provides: ['transport'],
    apply(ctx) {
      ctx.provide('transport', transport)
    },
  })()

async function idle(h4b: ReturnType<typeof createH4B>) {
  for (let i = 0; i < 50 && h4b.busy; i++) await new Promise((r) => setTimeout(r, 1))
  await new Promise((r) => setTimeout(r, 0))
}

const roles = (messages: Message[]) => messages.map((m) => `${m.role}${m.route ? ':' + m.route : ''}`)

describe('plugins', () => {
  it('mounts plugins in dependency order regardless of declaration order', async () => {
    const order: string[] = []
    const consumer = definePlugin({
      name: 'consumer',
      inject: ['transport'],
      apply() {
        order.push('consumer')
      },
    })
    const provider = definePlugin({
      name: 'provider',
      apply(ctx) {
        order.push('provider')
        ctx.provide('transport', scripted([]))
      },
    })
    await createH4B({ plugins: [consumer(), provider()] }).start()
    expect(order).toEqual(['provider', 'consumer'])
  })

  it('fails with a clear message when dependencies are missing', async () => {
    const consumer = definePlugin({ name: 'consumer', inject: ['transport'], apply() {} })
    await expect(createH4B({ plugins: [consumer()] }).start()).rejects.toThrow(
      'consumer (needs transport)',
    )
  })

  it('validates plugin config with a Standard Schema', async () => {
    const plugin = definePlugin<{ url: string }>({
      name: 'configured',
      config: z.object({ url: z.string().url() }),
      apply() {},
    })
    await expect(createH4B({ plugins: [plugin({ url: 'nope' })] }).start()).rejects.toThrow(
      'invalid config for plugin "configured"',
    )
  })

  it('undoes everything a plugin registered when it is disposed', async () => {
    const h4b = await createH4B().start()
    const cleanup = vi.fn()
    const listener = vi.fn()
    const dispose = await h4b.use(
      definePlugin({
        name: 'scoped',
        apply(ctx) {
          ctx.on('signal', listener)
          ctx.provide('transport', scripted([]))
          ctx.registerAction({ name: 'ping', description: 'Ping', handler: () => 'pong' })
          ctx.effect(() => cleanup)
        },
      })(),
    )
    expect(h4b.get('transport')).toBeDefined()
    expect(h4b.actions.has('ping')).toBe(true)

    await dispose()
    h4b.signal({ kind: 'context', modality: 'sensor', parts: [], source: 'x' })
    expect(listener).not.toHaveBeenCalled()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(h4b.get('transport')).toBeUndefined()
    expect(h4b.actions.has('ping')).toBe(false)
  })

  it('disposes dependents when an injected service goes away', async () => {
    const h4b = await createH4B().start()
    const removeTransport = await h4b.use(transportPlugin(scripted([])))
    const cleanup = vi.fn()
    await h4b.use(
      definePlugin({ name: 'dependent', inject: ['transport'], apply: (ctx) => ctx.effect(() => cleanup) })(),
    )
    await removeTransport()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('rejects plugins built for another kernel API', async () => {
    const old = definePlugin({ name: 'old', apiVersion: 1, apply() {} })
    await expect(createH4B({ plugins: [old()] }).start()).rejects.toThrow('targets API 1')
  })
})

describe('transport route', () => {
  it('streams assistant text into history', async () => {
    const transport = scripted([
      [
        { type: 'message.start', messageId: 'a1' },
        { type: 'message.delta', messageId: 'a1', delta: 'Olá' },
        { type: 'message.delta', messageId: 'a1', delta: ', mundo' },
        { type: 'message.end', messageId: 'a1' },
      ],
    ])
    const h4b = await createH4B({ plugins: [transportPlugin(transport)] }).start()
    const phases: string[] = []
    h4b.on('turn.status', (s) => phases.push(`${s.phase}:${s.route ?? '-'}`))

    h4b.send('oi')
    await idle(h4b)

    expect(roles(h4b.messages)).toEqual(['user:transport', 'assistant:transport'])
    expect(textOf(h4b.messages[1]!)).toBe('Olá, mundo')
    expect(h4b.messages[1]).toMatchObject({ streaming: false })
    expect(phases).toEqual(['received:-', 'acting:transport', 'done:transport'])
  })

  it('runs client actions requested by the assistant and continues the turn', async () => {
    const transport = scripted([
      [{ type: 'action.call', callId: 'c1', name: 'filter_orders', args: { month: 3 } }],
      [{ type: 'message.delta', messageId: 'a2', delta: 'Filtrei março.' }],
    ])
    const handler = vi.fn(({ month }: { month: number }) => ({ count: month * 2 }))
    const h4b = await createH4B({
      plugins: [transportPlugin(transport)],
      actions: [
        {
          name: 'filter_orders',
          description: 'Filter orders by month',
          input: z.object({ month: z.number().int().min(1).max(12) }),
          handler,
        },
      ],
    }).start()

    h4b.send('pedidos de março')
    await idle(h4b)

    expect(handler).toHaveBeenCalledWith({ month: 3 }, expect.objectContaining({ origin: 'assistant' }))
    expect(roles(h4b.messages)).toEqual(['user:transport', 'assistant:transport', 'tool:transport', 'assistant:transport'])
    expect(transport.requests).toHaveLength(2)
    expect(transport.requests[0]!.actions[0]).toMatchObject({
      name: 'filter_orders',
      parameters: { type: 'object', properties: { month: { type: 'integer' } } },
    })
    expect(transport.requests[1]!.messages.at(-1)).toMatchObject({ role: 'tool', result: { count: 6 } })
  })

  it('does not re-run tools the backend already executed', async () => {
    const transport = scripted([
      [
        { type: 'action.call', callId: 'c1', name: 'search', args: {} },
        { type: 'action.result', callId: 'c1', result: ['x'] },
        { type: 'message.delta', messageId: 'a1', delta: 'Achei.' },
      ],
    ])
    const handler = vi.fn()
    const h4b = await createH4B({
      plugins: [transportPlugin(transport)],
      actions: [{ name: 'search', description: 'Search', handler }],
    }).start()
    h4b.send('busca')
    await idle(h4b)
    expect(handler).not.toHaveBeenCalled()
    expect(transport.requests).toHaveLength(1)
  })

  it('answers unknown or invalid actions with an error result instead of crashing', async () => {
    const transport = scripted([
      [
        { type: 'action.call', callId: 'c1', name: 'missing', args: {} },
        { type: 'action.call', callId: 'c2', name: 'typed', args: { n: 'x' } },
      ],
      [{ type: 'message.delta', messageId: 'a', delta: 'ok' }],
    ])
    const h4b = await createH4B({
      plugins: [transportPlugin(transport)],
      actions: [{ name: 'typed', description: 'Typed', input: z.object({ n: z.number() }), handler: () => 1 }],
    }).start()
    h4b.send('x')
    await idle(h4b)
    const tools = h4b.messages.filter((m) => m.role === 'tool')
    expect(tools[0]).toMatchObject({ toolCallId: 'c1', error: expect.stringContaining('not available') })
    expect(tools[1]).toMatchObject({ toolCallId: 'c2', error: expect.stringContaining('Invalid arguments') })
  })

  it('applies shared state snapshots and patches', async () => {
    const transport = scripted([
      [
        { type: 'state.snapshot', state: { items: [] } },
        { type: 'state.patch', patch: [{ op: 'add', path: '/items/-', value: 'a' }] },
      ],
    ])
    const h4b = await createH4B({ plugins: [transportPlugin(transport)] }).start()
    h4b.send('x')
    await idle(h4b)
    expect(h4b.state).toEqual({ items: ['a'] })
  })

  it('reports transport errors as an error turn', async () => {
    const transport = scripted([[{ type: 'error', message: 'backend down' }]])
    const onError = vi.fn()
    const h4b = await createH4B({ plugins: [transportPlugin(transport)], onError }).start()
    const statuses: string[] = []
    h4b.on('turn.status', (s) => statuses.push(s.phase))
    h4b.send('x')
    await idle(h4b)
    expect(statuses.at(-1)).toBe('error')
    expect(h4b.getSnapshot().turn?.error).toBe('backend down')
  })

  it('processes triggers one at a time, in order', async () => {
    const seen: string[] = []
    const transport: Transport = {
      name: 'slow',
      async *run(request) {
        const last = request.messages.at(-1)!
        seen.push(textOf(last))
        await new Promise((r) => setTimeout(r, 5))
        yield { type: 'message.delta', messageId: `a-${seen.length}`, delta: 'ok' }
      },
    }
    const h4b = await createH4B({ plugins: [transportPlugin(transport)] }).start()
    h4b.send('1')
    h4b.send('2')
    await idle(h4b)
    expect(seen).toEqual(['1', '2'])
  })

  it('aborts the running turn', async () => {
    const transport: Transport = {
      name: 'hanging',
      async *run(_request, signal) {
        yield { type: 'message.delta', messageId: 'a', delta: 'começando' }
        await new Promise((resolve) => signal.addEventListener('abort', resolve))
      },
    }
    const h4b = await createH4B({ plugins: [transportPlugin(transport)] }).start()
    const statuses: string[] = []
    h4b.on('turn.status', (s) => statuses.push(s.phase))
    h4b.send('x')
    await new Promise((r) => setTimeout(r, 5))
    h4b.abort()
    await idle(h4b)
    expect(statuses.at(-1)).toBe('aborted')
  })

  it('sends context signals with every turn until removed', async () => {
    const transport = scripted([[], []])
    const h4b = await createH4B({ plugins: [transportPlugin(transport)] }).start()
    h4b.signal({ kind: 'context', key: 'route', modality: 'gui-event', parts: [{ type: 'data', name: 'route', value: '/orders' }], source: 'host' })
    h4b.send('a')
    await idle(h4b)
    h4b.removeContext('route')
    h4b.send('b')
    await idle(h4b)
    expect(transport.requests[0]!.context).toHaveLength(1)
    expect(transport.requests[1]!.context).toHaveLength(0)
    expect(h4b.messages.filter((m) => m.role === 'user')).toHaveLength(2)
  })
})

describe('direct route (menu)', () => {
  it('runs a matched action without the transport and records a synthetic tool call', async () => {
    const transport = scripted([[]])
    const h4b = await createH4B({
      plugins: [transportPlugin(transport)],
      actions: [
        {
          name: 'open_orders',
          description: 'Open orders',
          handler: () => 12,
          describeResult: (n) => `${n} pedidos abertos.`,
        },
      ],
    }).start()
    h4b.addMatcher({ name: 'test', match: (s) => (textOf(s.parts) === '/pedidos' ? { action: 'open_orders' } : null) })

    h4b.send('/pedidos')
    await idle(h4b)

    expect(transport.requests).toHaveLength(0)
    expect(roles(h4b.messages)).toEqual(['user:direct', 'assistant:direct', 'tool:direct', 'assistant:direct'])
    const call = h4b.messages[1]
    expect(call).toMatchObject({ role: 'assistant', toolCalls: [{ name: 'open_orders' }], streaming: false })
    expect(textOf(h4b.messages[3]!)).toBe('12 pedidos abertos.')
  })

  it('ignores low-confidence matches and actions not exposed to the user', async () => {
    const transport = scripted([[], []])
    const h4b = await createH4B({
      plugins: [transportPlugin(transport)],
      actions: [
        { name: 'a', description: 'A', handler: () => 1 },
        { name: 'b', description: 'B', handler: () => 1, exposeTo: ['assistant'] },
      ],
    }).start()
    h4b.addMatcher({ name: 'weak', match: () => ({ action: 'a', confidence: 0.4 }) })
    h4b.addMatcher({ name: 'hidden', priority: 1, match: () => ({ action: 'b' }) })
    h4b.send('x')
    await idle(h4b)
    expect(transport.requests).toHaveLength(1)
  })

  it('the next transport turn sees the direct action in history', async () => {
    const transport = scripted([[]])
    const h4b = await createH4B({
      plugins: [transportPlugin(transport)],
      actions: [{ name: 'go', description: 'Go', handler: () => 'ok' }],
    }).start()
    h4b.addMatcher({ name: 'm', match: (s) => (textOf(s.parts) === '/go' ? { action: 'go' } : null) })
    h4b.send('/go')
    h4b.send('e agora?')
    await idle(h4b)
    const sent = transport.requests[0]!.messages
    expect(sent.some((m) => m.role === 'assistant' && m.toolCalls?.[0]?.name === 'go')).toBe(true)
    expect(sent.some((m) => m.role === 'tool' && m.result === 'ok')).toBe(true)
  })
})

describe('capture', () => {
  it('routes triggers to the capturing plugin until released', async () => {
    const transport = scripted([[]])
    const h4b = await createH4B({ plugins: [transportPlugin(transport)] }).start()
    const captured: string[] = []
    const release = h4b.capture((s) => {
      captured.push(textOf(s.parts))
    })
    h4b.send('próximo')
    await idle(h4b)
    release()
    h4b.send('pergunta')
    await idle(h4b)
    expect(captured).toEqual(['próximo'])
    expect(transport.requests).toHaveLength(1)
    expect(h4b.messages[0]).toMatchObject({ route: 'capture' })
  })
})

describe('action security', () => {
  it('requires confirmation for destructive actions and denies without a confirmer', async () => {
    const handler = vi.fn()
    const h4b = await createH4B({
      actions: [{ name: 'delete_all', description: 'Delete', destructive: true, handler }],
    }).start()
    await expect(h4b.actions.invoke('delete_all', {}, { origin: 'assistant', callId: '1' })).rejects.toThrow(
      'not confirmed',
    )
    h4b.provide('confirm', async (request) => request.origin === 'user')
    await h4b.actions.invoke('delete_all', {}, { origin: 'user', callId: '2' })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('hides actions from origins they are not exposed to', async () => {
    const h4b = await createH4B({
      actions: [{ name: 'internal', description: 'I', handler: () => 1, exposeTo: ['user'] }],
    }).start()
    expect(h4b.actions.describe('agent')).toEqual([])
    await expect(h4b.actions.invoke('internal', {}, { origin: 'agent', callId: '1' })).rejects.toThrow('not exposed')
  })
})

describe('storage', () => {
  it('saves after each turn and restores on start', async () => {
    let saved: any = null
    const storage = definePlugin({
      name: 'mem',
      apply(ctx) {
        ctx.provide('storage', { load: () => saved, save: (s) => void (saved = structuredClone(s)), clear: () => void (saved = null) })
      },
    })
    const first = await createH4B({
      plugins: [storage(), transportPlugin(scripted([[{ type: 'message.delta', messageId: 'a', delta: 'oi' }]]))],
    }).start()
    first.send('olá')
    await idle(first)

    const second = await createH4B({ plugins: [storage()] }).start()
    expect(second.conversation.threadId).toBe(first.conversation.threadId)
    expect(roles(second.messages)).toEqual(['user:transport', 'assistant:transport'])
  })
})

describe('events', () => {
  it('isolates failing listeners', async () => {
    const onError = vi.fn()
    const h4b = await createH4B({ onError }).start()
    const ok = vi.fn()
    h4b.on('signal', () => {
      throw new Error('boom')
    })
    h4b.on('signal', ok)
    h4b.signal({ kind: 'context', modality: 'sensor', parts: [], source: 's' })
    expect(ok).toHaveBeenCalled()
    expect(onError).toHaveBeenCalled()
  })
})

describe('selective capture', () => {
  it('captures only accepted signals; others follow the normal route', async () => {
    const transport = scripted([[]])
    const h4b = await createH4B({ plugins: [transportPlugin(transport)] }).start()
    const captured: string[] = []
    h4b.capture((s) => void captured.push(textOf(s.parts)), { accepts: async (s) => textOf(s.parts) === 'próximo' })
    expect((await h4b.ask('próximo')).status.route).toBe('capture')
    expect((await h4b.ask('o que é isso?')).status.route).toBe('transport')
    expect(captured).toEqual(['próximo'])
  })
})

describe('rich content', () => {
  it('keeps ui.render in the assistant message and lets actions render into the reply', async () => {
    const transport = scripted([
      [
        { type: 'ui.render', component: 'card', props: { id: 1 } },
        { type: 'ui.render', slot: 'sidebar', component: 'map' },
        { type: 'action.call', callId: 'c', name: 'gallery', args: {} },
      ],
      [],
    ])
    const h4b = await createH4B({
      plugins: [transportPlugin(transport)],
      actions: [{ name: 'gallery', description: 'G', handler: (_a, call) => (call.render?.('gallery', { images: ['a.png'] }), 'ok') }],
    }).start()
    const rendered: string[] = []
    h4b.on('stimulus', ({ stimulus }) => void (stimulus.type === 'ui.render' && rendered.push(stimulus.component)))
    h4b.send('x')
    await idle(h4b)
    const assistant = h4b.messages.filter((m) => m.role === 'assistant')
    const ui = assistant.flatMap((m) => (m as any).parts.filter((p: any) => p.name === 'ui').map((p: any) => p.value.component))
    expect(ui).toEqual(['card', 'gallery'])
    expect(rendered).toEqual(['card', 'map', 'gallery'])
  })
})
