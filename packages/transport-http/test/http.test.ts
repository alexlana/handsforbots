import { createH4B, textOf } from '@handsforbots/core'
import { describe, expect, it, vi } from 'vitest'
import { http, openAICompatible, parseResponse, toChatMessages, universalLLM } from '../src/index.js'

type Call = { url: string; init: RequestInit; body: any }

function fakeServer(handler: (call: Call, index: number) => Response) {
  const calls: Call[] = []
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const call = { url, init, body: init.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    return handler(call, calls.length - 1)
  })
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls }
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const sse = (events: unknown[]) =>
  new Response(events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  })

describe('response parsing', () => {
  it('understands common shapes', () => {
    const text = (s: any[]) => s.filter((x) => x.type === 'message.delta').map((x) => x.delta)
    expect(text(parseResponse('oi'))).toEqual(['oi'])
    expect(text(parseResponse({ response: 'olá' }))).toEqual(['olá'])
    expect(text(parseResponse([{ text: 'a' }, { text: 'b' }]))).toEqual(['a', 'b'])
    expect(text(parseResponse({ messages: [{ content: 'c' }] }))).toEqual(['c'])
    expect(parseResponse({ choices: [{ message: { content: null, tool_calls: [{ id: 't', function: { name: 'go', arguments: '{"x":1}' } }] } }] })).toEqual([
      { type: 'action.call', callId: 't', name: 'go', args: { x: 1 } },
    ])
    expect(parseResponse({ error: { message: 'quota' } })).toEqual([{ type: 'error', message: 'quota' }])
  })

  it('maps history to chat messages without orphan tool results', () => {
    const chat = toChatMessages(
      [
        { id: '1', role: 'user', parts: [{ type: 'text', text: 'oi' }], modality: 'text', source: 'x', createdAt: 0 },
        { id: '2', role: 'assistant', parts: [], toolCalls: [{ id: 'c', name: 'go', args: {} }], createdAt: 0 },
        { id: '3', role: 'tool', toolCallId: 'c', name: 'go', result: 1, createdAt: 0 },
        { id: '4', role: 'assistant', parts: [{ type: 'text', text: 'feito' }], createdAt: 0 },
      ],
      2,
    )
    expect(chat.map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant'])
  })
})

describe('http transport', () => {
  it('opens a session once per thread and sends message, history, context and tools', async () => {
    const server = fakeServer((call) => (call.url.endsWith('/sessions') ? json({ session_id: 'S1' }) : json({ response: 'ok' })))
    const h4b = await createH4B({
      plugins: [http({ url: 'https://api/turns', session: { url: 'https://api/sessions' }, fetch: server.fetch })],
      actions: [{ name: 'go', description: 'Go', parameters: { type: 'object' }, handler: () => 1 }],
    }).start()
    h4b.signal({ kind: 'context', key: 'page', modality: 'gui-event', source: 'app', parts: [{ type: 'data', name: 'page', value: '/a' }] })
    await h4b.ask('primeira')
    await h4b.ask('segunda')
    expect(server.calls.map((c) => c.url)).toEqual(['https://api/sessions', 'https://api/turns', 'https://api/turns'])
    const turn = server.calls[2]!
    expect((turn.init.headers as Record<string, string>)['X-Session-ID']).toBe('S1')
    expect(turn.body).toMatchObject({
      session_id: 'S1',
      message: 'segunda',
      context: { page: ['/a'] },
      tools: [{ type: 'function', function: { name: 'go' } }],
    })
    expect(turn.body.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('falls back to the thread id when the session endpoint fails', async () => {
    const server = fakeServer((call) => (call.url.endsWith('/s') ? json({}, 500) : json('ok')))
    const h4b = await createH4B({ threadId: 'T', plugins: [http({ url: 'u', session: { url: '/s' }, fetch: server.fetch })] }).start()
    await h4b.ask('x')
    expect(server.calls[1]!.body.session_id).toBe('T')
  })

  it('runs tool calls and sends their results back', async () => {
    const server = fakeServer((call) =>
      call.body.messages.at(-1).role === 'tool'
        ? json({ response: `resultado: ${call.body.messages.at(-1).content}` })
        : json({ tool_calls: [{ id: 'c1', name: 'zoom', arguments: '{"level":2}' }] }),
    )
    const h4b = await createH4B({
      plugins: [http({ url: 'u', fetch: server.fetch })],
      actions: [{ name: 'zoom', description: 'Zoom', handler: ({ level }: { level: number }) => level * 10 }],
    }).start()
    const result = await h4b.ask('aproxima')
    expect(textOf(result.messages.at(-1)!)).toBe('resultado: 20')
  })

  it('streams SSE text and assembles fragmented tool calls', async () => {
    const server = fakeServer((call) =>
      call.body.messages.at(-1).role === 'tool'
        ? sse([{ delta: 'Pron' }, { delta: 'to.' }, '[DONE]'])
        : sse([
            { choices: [{ delta: { content: 'Vou ' } }] },
            { choices: [{ delta: { content: 'destacar.' } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'highlight', arguments: '{"tar' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'get":"#save"}' } }] } }] },
            '[DONE]',
          ]),
    )
    const highlight = vi.fn(() => ({ ok: true }))
    const h4b = await createH4B({
      plugins: [http({ url: 'u', fetch: server.fetch })],
      actions: [{ name: 'highlight', description: 'H', handler: highlight }],
    }).start()
    const deltas: string[] = []
    h4b.on('stimulus', ({ stimulus }) => void (stimulus.type === 'message.delta' && deltas.push(stimulus.delta)))
    const result = await h4b.ask('onde salvo?')
    expect(deltas).toEqual(['Vou ', 'destacar.', 'Pron', 'to.'])
    expect(highlight).toHaveBeenCalledWith({ target: '#save' }, expect.anything())
    expect(result.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
  })

  it('reports HTTP errors with a snippet of the body', async () => {
    const server = fakeServer(() => new Response('upstream timeout', { status: 504 }))
    const h4b = await createH4B({ plugins: [http({ url: 'u', fetch: server.fetch })], onError: () => {} }).start()
    expect((await h4b.ask('x')).status).toMatchObject({ phase: 'error', error: 'Backend responded 504: upstream timeout' })
  })
})

describe('presets', () => {
  it('sends the turns the memory plugin lets through, with its summary as context', async () => {
    const server = fakeServer(() => json({ response: 'ok' }))
    const h4b = await createH4B({
      memory: { send: 2 },
      plugins: [universalLLM({ url: 'https://site/api/llm', backendSession: false, fetch: server.fetch })],
    }).start()
    for (const text of ['a', 'b', 'c']) await h4b.ask(text)
    const body = server.calls.at(-1)!.body
    expect(body.context.conversation_history.map((m: any) => m.content)).toEqual(['b', 'ok'])
    expect(body.context.h4b_context['memory.summary'][0]).toContain('User: a')
    const generic = fakeServer(() => json({ response: 'ok' }))
    const h4b2 = await createH4B({ memory: { send: 'all' }, plugins: [http({ url: 'https://api/t', fetch: generic.fetch })] }).start()
    for (let i = 0; i < 12; i++) await h4b2.ask(`m${i}`)
    expect(generic.calls.at(-1)!.body.messages).toHaveLength(23) // no transport-level cap
  })

  it('universalLLM keeps the v1 request format and adds tools and context', async () => {
    const server = fakeServer((call) => (call.url.endsWith('/session') ? json({ session_id: 'abc' }) : json({ response: 'oi!' })))
    const h4b = await createH4B({
      plugins: [universalLLM({ url: 'https://site/api/llm', provider: 'anthropic', model: 'm', systemPrompt: 'seja breve', fetch: server.fetch })],
    }).start()
    const result = await h4b.ask('olá')
    expect(server.calls[0]).toMatchObject({ url: 'https://site/api/llm/session', init: { method: 'GET' } })
    const body = server.calls[1]!.body
    expect(body).toMatchObject({
      session_id: 'abc',
      provider: 'anthropic',
      model: 'm',
      messages: [{ role: 'user', content: 'olá' }],
      parameters: { max_tokens: 1024, stream: false },
      context: { system_prompt: 'seja breve', conversation_history: [], tools: [] },
    })
    expect(textOf(result.messages.at(-1)!)).toBe('oi!')
  })

  it('openAICompatible talks to chat/completions with system context and tools', async () => {
    const server = fakeServer(() => json({ choices: [{ message: { content: 'Olá do Ollama' } }] }))
    const h4b = await createH4B({
      plugins: [openAICompatible({ baseUrl: 'http://localhost:11434/v1/', model: 'llama3.2', systemPrompt: 'Você ajuda.', fetch: server.fetch })],
      actions: [{ name: 'go', description: 'Go', handler: () => 1 }],
    }).start()
    h4b.signal({ kind: 'context', key: 'tela', modality: 'gui-event', source: 'app', parts: [{ type: 'text', text: 'pedidos' }] })
    const result = await h4b.ask('oi')
    const call = server.calls[0]!
    expect(call.url).toBe('http://localhost:11434/v1/chat/completions')
    expect(call.body.messages[0]).toEqual({ role: 'system', content: 'Você ajuda.\n\nScreen context: {"tela":["pedidos"]}' })
    expect(call.body.tools[0].function.name).toBe('go')
    expect(textOf(result.messages.at(-1)!)).toBe('Olá do Ollama')
  })
})
