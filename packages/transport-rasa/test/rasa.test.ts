import { createH4B, textOf } from '@handsforbots/core'
import { describe, expect, it, vi } from 'vitest'
import { rasa, toStimuli } from '../src/index.js'

function fakeRasa(replies: (body: any) => unknown[]) {
  const bodies: any[] = []
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    bodies.push(body)
    return new Response(JSON.stringify(replies(body)), { status: 200 })
  })
  return { fetch: fetch as unknown as typeof globalThis.fetch, bodies }
}

describe('Rasa transport', () => {
  it('sends text with the thread as sender and context as metadata; maps replies to bubbles', async () => {
    const server = fakeRasa(() => [
      { recipient_id: 'x', text: 'Olá!' },
      { recipient_id: 'x', text: 'Escolha:', buttons: [{ title: 'Saldo', payload: '/check_balance' }] },
      { recipient_id: 'x', image: 'https://example.com/a.png' },
    ])
    const h4b = await createH4B({ plugins: [rasa({ url: 'http://rasa/webhook', fetch: server.fetch })] }).start()
    h4b.signal({ kind: 'context', key: 'page', modality: 'gui-event', source: 'app', parts: [{ type: 'data', name: 'page', value: '/conta' }] })
    const result = await h4b.ask('oi')

    expect(server.bodies[0]).toEqual({
      sender: h4b.conversation.threadId,
      message: 'oi',
      metadata: { h4b_context: { page: ['/conta'] } },
    })
    const bot = result.messages.filter((m) => m.role === 'assistant')
    expect(bot.map((m) => textOf(m))).toEqual(['Olá!', 'Escolha:', ''])
    expect(bot[1]!.parts[1]).toEqual({ type: 'data', name: 'quick_replies', value: [{ label: 'Saldo', payload: '/check_balance' }] })
    expect(bot[2]!.parts[0]).toMatchObject({ type: 'image', source: { kind: 'url', url: 'https://example.com/a.png' } })
  })

  it('sends the quick-reply payload instead of the visible label', async () => {
    const server = fakeRasa(() => [{ text: 'Seu saldo é R$ 10' }])
    const h4b = await createH4B({ plugins: [rasa({ url: 'u', fetch: server.fetch })] }).start()
    await h4b.ask({ modality: 'text', source: 'widget', parts: [{ type: 'text', text: 'Saldo' }, { type: 'data', name: 'reply_payload', value: '/check_balance' }] })
    expect(server.bodies[0].message).toBe('/check_balance')
  })

  it('runs GUI actions requested through custom payloads and can report results', async () => {
    const server = fakeRasa((body) =>
      body.message.startsWith('/action_done')
        ? [{ text: 'Viu o botão destacado?' }]
        : [{ text: 'Vou te mostrar.', custom: { h4b: { action: { name: 'highlight', args: { target: '#save' } } } } }],
    )
    const highlight = vi.fn(() => ({ ok: true }))
    const h4b = await createH4B({
      plugins: [
        rasa({
          url: 'u',
          fetch: server.fetch,
          reportActionResults: (results) => `/action_done${JSON.stringify({ name: results[0]!.name })}`,
        }),
      ],
      actions: [{ name: 'highlight', description: 'Highlight', handler: highlight }],
    }).start()
    const result = await h4b.ask('onde salvo?')
    expect(highlight).toHaveBeenCalledWith({ target: '#save' }, expect.objectContaining({ origin: 'assistant' }))
    expect(server.bodies.map((b) => b.message)).toEqual(['onde salvo?', '/action_done{"name":"highlight"}'])
    expect(textOf(result.messages.at(-1)!)).toBe('Viu o botão destacado?')
  })

  it('does not call Rasa again after actions unless asked to report', async () => {
    const server = fakeRasa(() => [{ custom: { h4b: { action: { name: 'noop' } } } }])
    const h4b = await createH4B({
      plugins: [rasa({ url: 'u', fetch: server.fetch })],
      actions: [{ name: 'noop', description: 'Noop', handler: () => null }],
    }).start()
    await h4b.ask('x')
    expect(server.bodies).toHaveLength(1)
  })

  it('reports HTTP errors as error turns', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 500, statusText: 'Server Error' }))
    const h4b = await createH4B({ plugins: [rasa({ url: 'u', fetch: fetch as any })], onError: () => {} }).start()
    expect((await h4b.ask('x')).status).toMatchObject({ phase: 'error', error: 'Rasa responded 500 Server Error' })
  })

  it('maps effects, renders and unknown custom payloads', () => {
    const out = toStimuli([
      { custom: { h4b: { effect: { name: 'scroll', value: '#top' }, render: { component: 'Card', props: { id: 1 } } } } },
      { custom: { foo: 1 } },
    ])
    expect(out).toEqual([
      { type: 'ui.effect', name: 'scroll', value: '#top' },
      { type: 'ui.render', component: 'Card', props: { id: 1 }, slot: undefined },
      { type: 'custom', name: 'rasa.custom', value: { foo: 1 } },
    ])
  })
})
