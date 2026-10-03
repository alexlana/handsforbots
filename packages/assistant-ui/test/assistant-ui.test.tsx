// @vitest-environment jsdom
import { AssistantRuntimeProvider, type AssistantRuntime } from '@assistant-ui/react'
import { createH4B, type Transport } from '@handsforbots/core'
import { H4BProvider } from '@handsforbots/react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toThreadMessages, useH4BAssistantRuntime } from '../src/index.js'

afterEach(cleanup)

function mount(h4b: ReturnType<typeof createH4B>) {
  let runtime!: AssistantRuntime
  function Probe() {
    runtime = useH4BAssistantRuntime()
    return <AssistantRuntimeProvider runtime={runtime}>{null}</AssistantRuntimeProvider>
  }
  render(
    <H4BProvider value={h4b}>
      <Probe />
    </H4BProvider>,
  )
  return () => runtime
}

describe('assistant-ui runtime', () => {
  it('sends composer messages through H4B and shows replies with tool calls', async () => {
    const transport: Transport = {
      name: 't',
      async *run(request) {
        if (request.messages.at(-1)!.role === 'user') {
          yield { type: 'action.call', callId: 'c1', name: 'highlight', args: { target: '#save' } }
        } else {
          yield { type: 'message.delta', messageId: 'a2', delta: 'Destaquei o botão.' }
        }
      },
    }
    const highlight = vi.fn(() => ({ ok: true }))
    const h4b = await createH4B({ actions: [{ name: 'highlight', description: 'H', handler: highlight }] }).start()
    h4b.provide('transport', transport)
    const runtime = mount(h4b)

    await act(async () => {
      runtime().thread.append({ role: 'user', content: [{ type: 'text', text: 'onde salvo?' }] })
      await h4b.when('turn.status', (s) => s.phase === 'done')
    })

    expect(highlight).toHaveBeenCalledOnce()
    const thread = runtime().thread.getState().messages
    expect(thread.map((m) => m.role)).toEqual(['user', 'assistant', 'assistant'])
    expect(thread[0]!.content[0]).toMatchObject({ type: 'text', text: 'onde salvo?' })
    expect(thread[1]!.content[0]).toMatchObject({ type: 'tool-call', toolName: 'highlight', args: { target: '#save' }, result: { ok: true } })
    expect(thread[2]!.content[0]).toMatchObject({ type: 'text', text: 'Destaquei o botão.' })
  })

  it('reflects running state and cancels through H4B', async () => {
    let release!: () => void
    const transport: Transport = {
      name: 'slow',
      async *run(_r, signal) {
        await new Promise<void>((resolve) => {
          release = resolve
          signal.addEventListener('abort', () => resolve())
        })
      },
    }
    const h4b = await createH4B().start()
    h4b.provide('transport', transport)
    const runtime = mount(h4b)
    await act(async () => {
      runtime().thread.append({ role: 'user', content: [{ type: 'text', text: 'demora' }] })
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(runtime().thread.getState().isRunning).toBe(true)
    const aborted = h4b.when('turn.status', (s) => s.phase === 'aborted')
    await act(async () => {
      runtime().thread.cancelRun()
      await aborted
    })
    expect(runtime().thread.getState().isRunning).toBe(false)
    void release
  })

  it('shows direct commands and rich content from other routes', () => {
    const thread = toThreadMessages([
      { id: 'u', role: 'user', parts: [{ type: 'text', text: '/atrasados' }], modality: 'text', source: 'menu', route: 'direct', createdAt: 1 },
      { id: 'a', role: 'assistant', parts: [], toolCalls: [{ id: 'c', name: 'filter', args: {} }], route: 'direct', createdAt: 2 },
      { id: 't', role: 'tool', toolCallId: 'c', name: 'filter', result: 3, route: 'direct', createdAt: 3 },
      { id: 'b', role: 'assistant', parts: [{ type: 'text', text: '3 pedidos.' }, { type: 'data', name: 'ui', value: { component: 'gallery' } }], route: 'direct', createdAt: 4 },
    ])
    expect(thread).toHaveLength(3)
    expect(thread[1]).toMatchObject({ role: 'assistant', content: [{ type: 'tool-call', result: 3 }], metadata: { custom: { route: 'direct' } } })
    expect(thread[2]!.content).toEqual([{ type: 'text', text: '3 pedidos.' }, { type: 'data-h4b-ui', data: { component: 'gallery' } }])
  })
})
