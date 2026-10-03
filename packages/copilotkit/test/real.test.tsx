// @vitest-environment jsdom
import { AbstractAgent, CopilotKitProvider, EventType, type BaseEvent, type RunAgentInput } from '@copilotkit/react-core/v2'
import { createH4B, textOf } from '@handsforbots/core'
import { H4BProvider } from '@handsforbots/react'
import { act, cleanup, render } from '@testing-library/react'
import { Observable } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopilotKitBridge } from '../src/index.js'

afterEach(cleanup)

/** Local AG-UI agent: asks for the `highlight` frontend tool, then answers with text. */
class LocalAgent extends AbstractAgent {
  inputs: RunAgentInput[] = []
  run(input: RunAgentInput): Observable<BaseEvent> {
    this.inputs.push(input)
    return new Observable<BaseEvent>((subscriber) => {
      const emit = (event: Record<string, unknown>) => subscriber.next(event as BaseEvent)
      emit({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId })
      const last = input.messages.at(-1)
      if (last?.role === 'tool') {
        emit({ type: EventType.TEXT_MESSAGE_START, messageId: `m-${input.runId}`, role: 'assistant' })
        emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: `m-${input.runId}`, delta: `Destaquei (${last.content}).` })
        emit({ type: EventType.TEXT_MESSAGE_END, messageId: `m-${input.runId}` })
      } else {
        emit({ type: EventType.TOOL_CALL_START, toolCallId: 'tc-1', toolCallName: 'highlight' })
        emit({ type: EventType.TOOL_CALL_ARGS, toolCallId: 'tc-1', delta: '{"target":"#save"}' })
        emit({ type: EventType.TOOL_CALL_END, toolCallId: 'tc-1' })
      }
      emit({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId })
      subscriber.complete()
    })
  }
  clone() {
    return new LocalAgent()
  }
}

describe('CopilotKit bridge against the real CopilotKit runtime (self-managed agent)', () => {
  it('voice/H4B input reaches the CopilotKit agent, which runs the H4B action as a frontend tool', async () => {
    const agent = new LocalAgent()
    const highlight = vi.fn(({ target }: { target: string }) => ({ ok: true, target }))
    const h4b = await createH4B({
      actions: [
        {
          name: 'highlight',
          description: 'Highlights an element',
          parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
          handler: highlight,
        },
      ],
    }).start()
    h4b.signal({ kind: 'context', key: 'page', modality: 'gui-event', source: 'app', parts: [{ type: 'data', name: 'page', value: '/editor' }] })

    render(
      <CopilotKitProvider selfManagedAgents={{ default: agent }}>
        <H4BProvider value={h4b}>
          <CopilotKitBridge />
        </H4BProvider>
      </CopilotKitProvider>,
    )
    await act(async () => {})

    let result!: Awaited<ReturnType<typeof h4b.ask>>
    await act(async () => {
      result = await h4b.ask({ modality: 'transcript', source: 'voice', parts: [{ type: 'text', text: 'onde eu salvo?' }] })
    })

    expect(result.status).toMatchObject({ phase: 'done', route: 'transport' })
    expect(highlight).toHaveBeenCalledOnce()
    expect(highlight).toHaveBeenCalledWith({ target: '#save' }, expect.objectContaining({ origin: 'assistant' }))
    // The agent saw the H4B action as a tool and the screen context.
    expect(agent.inputs[0]!.tools.map((t) => t.name)).toContain('highlight')
    expect(JSON.stringify(agent.inputs[0]!.context)).toContain('/editor')
    // History in H4B: user, tool call, result, final text.
    expect(result.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(textOf(result.messages.at(-1)!)).toContain('Destaquei')
  })
})
