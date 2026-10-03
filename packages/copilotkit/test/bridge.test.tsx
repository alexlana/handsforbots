// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { createH4B, textOf } from '@handsforbots/core'
import { H4BProvider } from '@handsforbots/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* -------------------------------------------------------------------------- */
/* CopilotKit stand-in: records hook calls and runs tools like the real core  */
/* -------------------------------------------------------------------------- */

const ck = vi.hoisted(() => {
  const state = {
    tools: [] as any[],
    context: undefined as any,
    agent: undefined as any,
    copilotkit: undefined as any,
  }
  const reset = () => {
    const subscribers = new Set<any>()
    const emit = (event: any) => subscribers.forEach((s) => s.onEvent?.({ event }))
    state.tools = []
    state.context = undefined
    state.agent = {
      messages: [] as any[],
      addMessages: vi.fn((m: any[]) => state.agent.messages.push(...m)),
      subscribe: (s: any) => {
        subscribers.add(s)
        return { unsubscribe: () => subscribers.delete(s) }
      },
    }
    // Simulates CopilotKit: the agent asks for `highlight`, CopilotKit runs the
    // frontend tool, then the follow-up run answers with text.
    state.copilotkit = {
      runAgent: vi.fn(async () => {
        emit({ type: 'TOOL_CALL_START', toolCallId: 'tc1', toolCallName: 'highlight' })
        emit({ type: 'TOOL_CALL_ARGS', toolCallId: 'tc1', delta: '{"target":"export"}' })
        emit({ type: 'TOOL_CALL_END', toolCallId: 'tc1' })
        emit({ type: 'RUN_FINISHED' })
        const tool = state.tools.find((t) => t.name === 'highlight')
        await tool.handler({ target: 'export' }, { toolCall: { id: 'tc1' } })
        emit({ type: 'TEXT_MESSAGE_START', messageId: 'a1', role: 'assistant' })
        emit({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'a1', delta: 'Destaquei o botão.' })
        emit({ type: 'TEXT_MESSAGE_END', messageId: 'a1' })
        emit({ type: 'RUN_FINISHED' })
      }),
      stopAgent: vi.fn(),
    }
  }
  reset()
  return { state, reset }
})

vi.mock('@copilotkit/react-core/v2', () => ({
  useFrontendTools: (tools: any[]) => void (ck.state.tools = tools),
  useAgentContext: (context: any) => void (ck.state.context = context),
  useAgent: () => ({ agent: ck.state.agent }),
  useCopilotKit: () => ({ copilotkit: ck.state.copilotkit }),
}))

const { CopilotKitBridge, toStandardSchema } = await import('../src/index.js')

beforeEach(() => ck.reset())
afterEach(cleanup)

async function setup(props = {}) {
  const highlight = vi.fn(({ target }: { target: string }) => ({ ok: true, target }))
  const h4b = await createH4B({
    actions: [
      {
        name: 'highlight',
        description: 'Highlight an area',
        parameters: { type: 'object', properties: { target: { type: 'string' } } },
        handler: highlight,
      },
      { name: 'menu_only', description: 'Menu only', exposeTo: ['user'], handler: () => 7, describeResult: (n) => `${n} itens.` },
    ],
  }).start()
  render(
    <H4BProvider value={h4b}>
      <CopilotKitBridge {...props} />
    </H4BProvider>,
  )
  return { h4b, highlight }
}

describe('CopilotKit bridge', () => {
  it('registers assistant-visible actions as frontend tools with JSON Schema', async () => {
    await setup()
    expect(ck.state.tools.map((t) => t.name)).toEqual(['highlight'])
    const tool = ck.state.tools[0]
    expect(tool.webmcp).toBe(false)
    expect(tool.parameters['~standard'].jsonSchema.input({ target: 'draft-07' })).toEqual({
      type: 'object',
      properties: { target: { type: 'string' } },
    })
  })

  it('follows actions registered later', async () => {
    const { h4b } = await setup()
    act(() => void h4b.actions.register({ name: 'later', description: 'Later', handler: () => 1 }))
    expect(ck.state.tools.map((t) => t.name)).toEqual(['highlight', 'later'])
  })

  it('shares context signals with the agent', async () => {
    const { h4b } = await setup()
    act(() => {
      h4b.signal({ kind: 'context', key: 'page', modality: 'gui-event', source: 'app', parts: [{ type: 'data', name: 'page', value: { path: '/orders' } }] })
    })
    expect(ck.state.context.value).toEqual({ page: { path: '/orders' } })
  })

  it('sends H4B input (e.g. voice) through the CopilotKit agent without running tools twice', async () => {
    const { h4b, highlight } = await setup()
    const result = await act(() =>
      h4b.ask({ modality: 'transcript', source: 'voice', parts: [{ type: 'text', text: 'onde exporto?' }] }),
    )
    expect(ck.state.agent.addMessages).toHaveBeenCalledWith([expect.objectContaining({ role: 'user', content: 'onde exporto?' })])
    expect(highlight).toHaveBeenCalledOnce()
    expect(result.status).toMatchObject({ phase: 'done', route: 'transport' })
    expect(result.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(result.messages[2]).toMatchObject({ toolCallId: 'tc1', result: { ok: true, target: 'export' } })
    expect(textOf(result.messages[3]!)).toBe('Destaquei o botão.')
  })

  it('mirrors direct commands into the agent history', async () => {
    const { h4b } = await setup()
    h4b.addMatcher({ name: 'm', match: (s) => (textOf(s.parts) === '/menu' ? { action: 'menu_only' } : null) })
    await act(() => h4b.ask('/menu'))
    await act(async () => {})
    const roles = ck.state.agent.messages.map((m: any) => m.role)
    expect(roles).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(ck.state.copilotkit.runAgent).not.toHaveBeenCalled()
  })

  it('can leave the transport to H4B', async () => {
    const { h4b } = await setup({ transport: false })
    expect(h4b.get('transport')).toBeUndefined()
  })

  it('passes Standard Schemas through untouched', () => {
    const schema = { '~standard': { version: 1, vendor: 'x', validate: (v: unknown) => ({ value: v }) } } as any
    expect(toStandardSchema({ name: 'a', description: 'a', input: schema, handler: () => 1 })).toBe(schema)
  })
})
