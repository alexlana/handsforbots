import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { createH4B, textOf } from '@handsforbots/core'
import { transportConformance } from '@handsforbots/testkit'
import { convertToModelMessages, jsonSchema, streamText, tool } from 'ai'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import { afterEach, describe, expect, it } from 'vitest'
import { aiSdk, createAiSdkTransport, createChunkMapper, toUIMessages } from '../src/index.js'

const sse = (chunks: unknown[]) =>
  new Response([...chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`), 'data: [DONE]\n\n'].join(''), {
    headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
  })

/** Hand-written AI SDK route following the conformance scenarios. */
function route(scenario: string) {
  return (async (_url: string, init: RequestInit = {}) => {
    if (scenario === 'error') return new Response('boom', { status: 500 })
    if (scenario === 'hang') {
      return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    }
    const { messages } = JSON.parse(String(init.body))
    const toolPart = messages.at(-1).parts.find((p: any) => p.type === 'dynamic-tool' && p.state === 'output-available')
    if (scenario === 'tool' && !toolPart) {
      return sse([{ type: 'start' }, { type: 'tool-input-available', toolCallId: 't1', toolName: 'conformance_echo', input: { value: 'ping' } }, { type: 'finish' }])
    }
    const text = toolPart ? `echo returned ${JSON.stringify(toolPart.output)}` : 'hello'
    return sse([{ type: 'start' }, { type: 'text-start', id: 'x' }, { type: 'text-delta', id: 'x', delta: text }, { type: 'text-end', id: 'x' }, { type: 'finish' }])
  }) as typeof fetch
}

transportConformance('ai-sdk', { create: (scenario) => createAiSdkTransport({ url: '/api/chat', fetch: route(scenario) }) })

describe('chunk mapping', () => {
  it('maps text, client and server tools, data parts and errors', () => {
    const map = createChunkMapper()
    const out = [
      { type: 'start', messageId: 'm1' },
      { type: 'text-start', id: 'a' },
      { type: 'text-delta', id: 'a', delta: 'Oi' },
      { type: 'tool-input-available', toolCallId: 's1', toolName: 'search', input: { q: 'x' }, providerExecuted: true },
      { type: 'tool-output-available', toolCallId: 's1', output: ['r'] },
      { type: 'data-ui-effect', data: { name: 'highlight', value: '#save' } },
      { type: 'data-weather', data: { c: 20 } },
      { type: 'error', errorText: 'quota' },
      { type: 'finish' },
    ].flatMap(map)
    expect(out).toEqual([
      { type: 'message.start', messageId: 'm1' },
      { type: 'message.delta', messageId: 'm1', delta: 'Oi' },
      { type: 'action.call', callId: 's1', name: 'search', args: { q: 'x' }, messageId: 'm1' },
      { type: 'action.result', callId: 's1', result: ['r'] },
      { type: 'ui.effect', name: 'highlight', value: '#save' },
      { type: 'custom', name: 'ai-sdk.data.weather', value: { c: 20 } },
      { type: 'error', message: 'quota' },
      { type: 'message.end', messageId: 'm1' },
    ])
  })

  it('folds tool results into the assistant tool part, like the AI SDK client does', async () => {
    const ui = await toUIMessages([
      { id: 'u', role: 'user', parts: [{ type: 'text', text: 'oi' }], modality: 'text', source: 'x', createdAt: 0 },
      { id: 'a', role: 'assistant', parts: [], toolCalls: [{ id: 'c', name: 'go', args: { n: 1 } }], createdAt: 0 },
      { id: 't', role: 'tool', toolCallId: 'c', name: 'go', result: 2, createdAt: 0 },
    ])
    expect(ui).toEqual([
      { id: 'u', role: 'user', parts: [{ type: 'text', text: 'oi' }] },
      { id: 'a', role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: 'go', toolCallId: 'c', state: 'output-available', input: { n: 1 }, output: 2 }] },
    ])
  })
})

describe('against the real AI SDK (streamText + toUIMessageStreamResponse)', () => {
  let server: Server | undefined
  afterEach(() => server?.close())

  it('runs a client-side tool round trip end to end', async () => {
    const prompts: any[] = []
    const model = new MockLanguageModelV4({
      doStream: async ({ prompt }: any) => {
        prompts.push(prompt)
        const last = prompt.at(-1)
        const chunks: any[] =
          last.role === 'tool'
            ? [
                { type: 'text-start', id: 't' },
                { type: 'text-delta', id: 't', delta: `Destaquei: ${JSON.stringify(last.content[0].output)}` },
                { type: 'text-end', id: 't' },
                { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage() },
              ]
            : [
                { type: 'tool-call', toolCallId: 'call-1', toolName: 'highlight', input: '{"target":"#save"}' },
                { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: usage() },
              ]
        return { stream: simulateReadableStream({ chunks }) }
      },
    } as any)

    server = createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      const { messages, tools, context } = JSON.parse(body)
      const result = streamText({
        model,
        system: `Screen: ${JSON.stringify(context)}`,
        messages: await convertToModelMessages(messages),
        tools: Object.fromEntries(
          tools.map((t: any) => [t.name, tool({ description: t.description, inputSchema: jsonSchema(t.parameters) })]),
        ),
      })
      const response = result.toUIMessageStreamResponse()
      res.writeHead(response.status, Object.fromEntries(response.headers))
      Readable.fromWeb(response.body as any).pipe(res)
    })
    await new Promise<void>((resolve) => server!.listen(0, resolve))
    const { port } = server.address() as AddressInfo

    const highlighted: string[] = []
    const h4b = await createH4B({
      plugins: [aiSdk({ url: `http://127.0.0.1:${port}/api/chat` })],
      actions: [
        {
          name: 'highlight',
          description: 'Highlights an element',
          parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
          handler: ({ target }: { target: string }) => (highlighted.push(target), { ok: true }),
        },
      ],
    }).start()
    h4b.signal({ kind: 'context', key: 'page', modality: 'gui-event', source: 'app', parts: [{ type: 'data', name: 'page', value: '/editor' }] })

    const result = await h4b.ask('onde salvo?')
    expect(result.status.phase).toBe('done')
    expect(highlighted).toEqual(['#save'])
    expect(textOf(result.messages.at(-1)!)).toBe('Destaquei: {"type":"json","value":{"ok":true}}')
    expect(prompts[0][0]).toMatchObject({ role: 'system', content: 'Screen: {"page":["/editor"]}' })
    expect(prompts[1].at(-1)).toMatchObject({ role: 'tool' })
  })
})

function usage() {
  return {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  }
}
