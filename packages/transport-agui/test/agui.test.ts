import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/core'
import { EventEncoder } from '@ag-ui/encoder'
import { createH4B, textOf, type Message } from '@handsforbots/core'
import { afterEach, describe, expect, it } from 'vitest'
import { agui, createEventMapper, toAguiMessages, type AguiRunner } from '../src/index.js'

const ev = (type: EventType, fields: Record<string, unknown> = {}) => ({ type, ...fields }) as BaseEvent

function runner(events: BaseEvent[] | ((input: RunAgentInput) => BaseEvent[])): AguiRunner & { inputs: RunAgentInput[] } {
  const inputs: RunAgentInput[] = []
  return {
    inputs,
    run(input) {
      inputs.push(input)
      const list = typeof events === 'function' ? events(input) : events
      return {
        subscribe(observer) {
          queueMicrotask(() => {
            for (const e of list) observer.next(e)
            observer.complete()
          })
          return { unsubscribe() {} }
        },
      }
    },
  }
}

async function idle(h4b: ReturnType<typeof createH4B>) {
  for (let i = 0; i < 200 && h4b.busy; i++) await new Promise((r) => setTimeout(r, 2))
}

describe('event mapper', () => {
  it('maps text, tool calls, state, custom and errors', () => {
    const map = createEventMapper()
    const out = [
      ev(EventType.TEXT_MESSAGE_START, { messageId: 'm', role: 'assistant' }),
      ev(EventType.TEXT_MESSAGE_CONTENT, { messageId: 'm', delta: 'Oi' }),
      ev(EventType.TEXT_MESSAGE_END, { messageId: 'm' }),
      ev(EventType.TOOL_CALL_START, { toolCallId: 't', toolCallName: 'highlight', parentMessageId: 'm' }),
      ev(EventType.TOOL_CALL_ARGS, { toolCallId: 't', delta: '{"selector":' }),
      ev(EventType.TOOL_CALL_ARGS, { toolCallId: 't', delta: '"#save"}' }),
      ev(EventType.TOOL_CALL_END, { toolCallId: 't' }),
      ev(EventType.STATE_DELTA, { delta: [{ op: 'add', path: '/a', value: 1 }] }),
      ev(EventType.CUSTOM, { name: 'h4b.ui.effect', value: { name: 'scroll', value: '#top' } }),
      ev(EventType.RUN_ERROR, { message: 'nope' }),
    ].flatMap(map)

    expect(out).toEqual([
      { type: 'message.start', messageId: 'm' },
      { type: 'message.delta', messageId: 'm', delta: 'Oi' },
      { type: 'message.end', messageId: 'm' },
      { type: 'action.call', callId: 't', name: 'highlight', args: { selector: '#save' }, messageId: 'm' },
      { type: 'state.patch', patch: [{ op: 'add', path: '/a', value: 1 }] },
      { type: 'ui.effect', name: 'scroll', value: '#top' },
      { type: 'error', message: 'nope', code: undefined },
    ])
  })

  it('expands chunk events and flushes them when the run finishes', () => {
    const map = createEventMapper()
    const out = [
      ev(EventType.TEXT_MESSAGE_CHUNK, { messageId: 'm', delta: 'a' }),
      ev(EventType.TEXT_MESSAGE_CHUNK, { delta: 'b' }),
      ev(EventType.TOOL_CALL_CHUNK, { toolCallId: 't', toolCallName: 'go', delta: '{"x"' }),
      ev(EventType.TOOL_CALL_CHUNK, { delta: ':1}' }),
      ev(EventType.RUN_FINISHED, { threadId: 'th', runId: 'r' }),
    ].flatMap(map)
    expect(out).toEqual([
      { type: 'message.start', messageId: 'm' },
      { type: 'message.delta', messageId: 'm', delta: 'a' },
      { type: 'message.delta', messageId: 'm', delta: 'b' },
      { type: 'action.call', callId: 't', name: 'go', args: { x: 1 }, messageId: undefined },
      { type: 'message.end', messageId: 'm' },
    ])
  })
})

describe('message conversion', () => {
  it('converts history, tool calls and media to AG-UI messages', async () => {
    const messages: Message[] = [
      {
        id: 'u1',
        role: 'user',
        modality: 'image',
        source: 'camera',
        createdAt: 0,
        parts: [
          { type: 'text', text: 'o que é isso?' },
          { type: 'image', mimeType: 'image/png', source: { kind: 'blob', blob: new Blob([new Uint8Array([1, 2, 3])]) } },
        ],
      },
      { id: 'a1', role: 'assistant', parts: [], toolCalls: [{ id: 'c1', name: 'zoom', args: { level: 2 } }], createdAt: 0 },
      { id: 't1', role: 'tool', toolCallId: 'c1', name: 'zoom', result: { ok: true }, createdAt: 0 },
      { id: 'a2', role: 'assistant', parts: [], createdAt: 0 },
    ]
    expect(await toAguiMessages(messages)).toEqual([
      {
        id: 'u1',
        role: 'user',
        content: [
          { type: 'text', text: 'o que é isso?' },
          { type: 'image', source: { type: 'data', value: 'AQID', mimeType: 'image/png' } },
        ],
      },
      {
        id: 'a1',
        role: 'assistant',
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'zoom', arguments: '{"level":2}' } }],
      },
      { id: 't1', role: 'tool', toolCallId: 'c1', content: '{"ok":true}' },
    ])
  })
})

describe('transport with injected agent', () => {
  it('sends actions as tools and context, and runs frontend tool round trips', async () => {
    const agent = runner((input) =>
      input.messages.at(-1)?.role === 'tool'
        ? [ev(EventType.TEXT_MESSAGE_CHUNK, { messageId: 'done', delta: 'Destacado.' }), ev(EventType.RUN_FINISHED, {})]
        : [
            ev(EventType.TOOL_CALL_START, { toolCallId: 'c1', toolCallName: 'highlight' }),
            ev(EventType.TOOL_CALL_ARGS, { toolCallId: 'c1', delta: '{"selector":"#save"}' }),
            ev(EventType.TOOL_CALL_END, { toolCallId: 'c1' }),
            ev(EventType.RUN_FINISHED, {}),
          ],
    )
    const highlighted: string[] = []
    const h4b = await createH4B({
      plugins: [agui({ agent })],
      actions: [
        {
          name: 'highlight',
          description: 'Highlight an element',
          parameters: { type: 'object', properties: { selector: { type: 'string' } } },
          handler: ({ selector }: { selector: string }) => {
            highlighted.push(selector)
            return { ok: true }
          },
        },
      ],
    }).start()
    h4b.signal({ kind: 'context', key: 'page', modality: 'gui-event', parts: [{ type: 'data', name: 'page', value: '/editor' }], source: 'host' })
    h4b.send('onde salvo?')
    await idle(h4b)

    expect(highlighted).toEqual(['#save'])
    expect(agent.inputs).toHaveLength(2)
    expect(agent.inputs[0]!.tools[0]!.name).toBe('highlight')
    expect(agent.inputs[0]!.context).toEqual([{ description: 'gui-event from page', value: 'page: "/editor"' }])
    expect(agent.inputs[1]!.messages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'c1', content: '{"ok":true}' })
    expect(textOf(h4b.messages.at(-1)!)).toBe('Destacado.')
  })
})

describe('transport over HTTP (HttpAgent + SSE)', () => {
  let server: Server | undefined
  afterEach(() => server?.close())

  it('streams from a real AG-UI endpoint', async () => {
    const received: RunAgentInput[] = []
    server = createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      const input = JSON.parse(body) as RunAgentInput
      received.push(input)
      const encoder = new EventEncoder({ accept: req.headers.accept })
      res.writeHead(200, { 'Content-Type': encoder.getContentType() })
      const send = (e: BaseEvent) => res.write(encoder.encode(e))
      send(ev(EventType.RUN_STARTED, { threadId: input.threadId, runId: input.runId }))
      send(ev(EventType.TEXT_MESSAGE_START, { messageId: 'm1', role: 'assistant' }))
      for (const word of ['Olá', ' do', ' servidor']) send(ev(EventType.TEXT_MESSAGE_CONTENT, { messageId: 'm1', delta: word }))
      send(ev(EventType.TEXT_MESSAGE_END, { messageId: 'm1' }))
      send(ev(EventType.RUN_FINISHED, { threadId: input.threadId, runId: input.runId }))
      res.end()
    })
    await new Promise<void>((resolve) => server!.listen(0, resolve))
    const { port } = server.address() as AddressInfo

    const h4b = await createH4B({ plugins: [agui({ url: `http://127.0.0.1:${port}/agent` })] }).start()
    h4b.send('oi')
    await idle(h4b)

    expect(received[0]!.messages).toEqual([{ id: expect.any(String), role: 'user', content: 'oi' }])
    expect(h4b.getSnapshot().turn?.phase).toBe('done')
    expect(textOf(h4b.messages.at(-1)!)).toBe('Olá do servidor')
  })
})
