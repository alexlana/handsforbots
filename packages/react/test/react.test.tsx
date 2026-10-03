// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { createH4B, textOf, type Transport, type TurnRequest } from '@handsforbots/core'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { H4BProvider, useAction, useBusy, useContextSignal, useMessages, useStimulus } from '../src/index.js'

afterEach(cleanup)

function Messages() {
  const messages = useMessages()
  const busy = useBusy()
  return (
    <ul data-busy={busy}>
      {messages.map((m) => (
        <li key={m.id}>
          {m.role}:{textOf(m)}
        </li>
      ))}
    </ul>
  )
}

describe('react bindings', () => {
  it('renders messages from the kernel store', async () => {
    const h4b = createH4B()
    h4b.provide('transport', {
      name: 't',
      async *run() {
        yield { type: 'message.delta', messageId: 'a', delta: 'oi!' }
      },
    })
    render(
      <H4BProvider value={h4b}>
        <Messages />
      </H4BProvider>,
    )
    await act(() => h4b.ask('olá'))
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['user:olá', 'assistant:oi!'])
  })

  it('registers actions while mounted, using the latest handler', async () => {
    const h4b = createH4B()
    function Counter() {
      const [count, setCount] = useState(0)
      useAction({
        name: 'increment',
        description: 'Increment the counter',
        handler: () => {
          setCount(count + 1)
          return count + 1
        },
      })
      return <output>{count}</output>
    }
    const view = render(
      <H4BProvider value={h4b}>
        <Counter />
      </H4BProvider>,
    )
    await act(async () => void (await h4b.actions.invoke('increment', {}, { origin: 'user', callId: '1' })))
    await act(async () => void (await h4b.actions.invoke('increment', {}, { origin: 'user', callId: '2' })))
    expect(screen.getByRole('status').textContent).toBe('2')
    view.unmount()
    expect(h4b.actions.has('increment')).toBe(false)
  })

  it('syncs context signals with component state and sends them with turns', async () => {
    const requests: TurnRequest[] = []
    const transport: Transport = {
      name: 't',
      async *run(request) {
        requests.push(request)
      },
    }
    const h4b = createH4B()
    h4b.provide('transport', transport)
    function Page({ filter }: { filter?: string }) {
      useContextSignal('filter', filter && { status: filter })
      return null
    }
    const view = render(
      <H4BProvider value={h4b}>
        <Page filter="open" />
      </H4BProvider>,
    )
    expect(h4b.context[0]?.parts[0]).toEqual({ type: 'data', name: 'filter', value: { status: 'open' } })
    view.rerender(
      <H4BProvider value={h4b}>
        <Page />
      </H4BProvider>,
    )
    expect(h4b.context).toEqual([])
  })

  it('delivers stimuli to listeners (e.g. GUI effects)', async () => {
    const h4b = createH4B()
    h4b.provide('transport', {
      name: 't',
      async *run() {
        yield { type: 'ui.effect', name: 'highlight', value: '#save' }
      },
    })
    const effects: unknown[] = []
    function Effects() {
      useStimulus(({ stimulus }) => {
        if (stimulus.type === 'ui.effect') effects.push(stimulus.value)
      })
      return null
    }
    render(
      <H4BProvider value={h4b}>
        <Effects />
      </H4BProvider>,
    )
    await act(() => h4b.ask('onde salvo?'))
    expect(effects).toEqual(['#save'])
  })
})
