// @vitest-environment jsdom
import { createH4B, textOf, type H4B } from '@handsforbots/core'
import type {} from '@handsforbots/voice'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, effectScope, h, nextTick, ref, type App, type Component } from 'vue'
import {
  h4bVue,
  useAction,
  useBusy,
  useContextSignal,
  useMessages,
  useService,
  useStimulus,
  useStore,
} from '../src/index.js'

const apps: App[] = []
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  document.body.innerHTML = ''
})

function mount(h4b: H4B, component: Component) {
  const el = document.createElement('div')
  document.body.append(el)
  const app = createApp(component).use(h4bVue(h4b))
  app.mount(el)
  apps.push(app)
  return { el, app }
}

describe('vue bindings', () => {
  it('renders messages from the kernel store', async () => {
    const h4b = createH4B()
    h4b.provide('transport', {
      name: 't',
      async *run() {
        yield { type: 'message.delta', messageId: 'a', delta: 'oi!' }
      },
    })
    const { el } = mount(
      h4b,
      defineComponent(() => {
        const messages = useMessages()
        const busy = useBusy()
        return () =>
          h('ul', { 'data-busy': busy.value }, messages.value.map((m) => h('li', { key: m.id }, `${m.role}:${textOf(m)}`)))
      }),
    )
    await h4b.ask('olá')
    await nextTick()
    expect([...el.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['user:olá', 'assistant:oi!'])
  })

  it('registers actions while mounted, with access to current refs', async () => {
    const h4b = createH4B()
    const count = ref(0)
    const { app } = mount(
      h4b,
      defineComponent(() => {
        useAction({ name: 'increment', description: 'Increment the counter', handler: () => ++count.value })
        return () => h('output', count.value)
      }),
    )
    await h4b.actions.invoke('increment', {}, { origin: 'user', callId: '1' })
    await h4b.actions.invoke('increment', {}, { origin: 'user', callId: '2' })
    expect(count.value).toBe(2)
    app.unmount()
    apps.length = 0
    expect(h4b.actions.has('increment')).toBe(false)
  })

  it('syncs context signals with a ref and removes them on unmount', async () => {
    const h4b = createH4B()
    const filter = ref<string | undefined>('open')
    const { app } = mount(
      h4b,
      defineComponent(() => {
        useContextSignal('filter', () => filter.value && { status: filter.value })
        return () => null
      }),
    )
    expect(h4b.context[0]?.parts[0]).toEqual({ type: 'data', name: 'filter', value: { status: 'open' } })
    filter.value = 'late'
    await nextTick()
    expect(h4b.context[0]?.parts[0]).toMatchObject({ value: { status: 'late' } })
    filter.value = undefined
    await nextTick()
    expect(h4b.context).toEqual([])
    filter.value = 'open'
    await nextTick()
    app.unmount()
    apps.length = 0
    expect(h4b.context).toEqual([])
  })

  it('follows a store-like service provided after mount (e.g. voice)', async () => {
    const h4b = createH4B()
    let state = { listening: false }
    const listeners = new Set<() => void>()
    const fakeVoice = {
      getState: () => state,
      subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
    }
    let listening: { value: { listening: boolean } | undefined } | undefined
    mount(
      h4b,
      defineComponent(() => {
        listening = useStore(useService('voice'))
        return () => null
      }),
    )
    expect(listening!.value).toBeUndefined()
    const remove = h4b.provide('voice', fakeVoice as never)
    expect(listening!.value).toEqual({ listening: false })
    state = { listening: true }
    listeners.forEach((l) => l())
    expect(listening!.value).toEqual({ listening: true })
    remove()
    expect(listening!.value).toBeUndefined()
    expect(listeners.size).toBe(0)
  })

  it('delivers stimuli to listeners and stops when the scope ends', async () => {
    const h4b = createH4B()
    h4b.provide('transport', {
      name: 't',
      async *run() {
        yield { type: 'ui.effect', name: 'highlight', value: '#save' }
      },
    })
    const effects: unknown[] = []
    const { app } = mount(
      h4b,
      defineComponent(() => {
        useStimulus(({ stimulus }) => {
          if (stimulus.type === 'ui.effect') effects.push(stimulus.value)
        })
        return () => null
      }),
    )
    await h4b.ask('onde salvo?')
    app.unmount()
    apps.length = 0
    await h4b.ask('de novo')
    expect(effects).toEqual(['#save'])
  })

  it('explains a missing provider', () => {
    const scope = effectScope()
    expect(() => scope.run(() => useMessages())).toThrow(/h4bVue/)
    scope.stop()
  })
})
