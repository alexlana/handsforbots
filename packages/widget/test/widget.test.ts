// @vitest-environment jsdom
import { createH4B, textOf, type Transport, type TurnRequest } from '@handsforbots/core'
import { menu } from '@handsforbots/menu'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderMarkdown, widget, type H4BChatElement } from '../src/index.js'

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

function scripted(reply: (request: TurnRequest) => any[]): Transport & { requests: TurnRequest[] } {
  const requests: TurnRequest[] = []
  return {
    name: 's',
    requests,
    async *run(request) {
      requests.push(request)
      yield* reply(request)
    },
  }
}

async function mount(options = {}, transport = scripted(() => [])) {
  const h4b = createH4B({ plugins: [widget({ pace: 0, ...options })] })
  h4b.provide('transport', transport)
  await h4b.start()
  const element = document.querySelector('h4b-chat') as H4BChatElement
  const $ = (selector: string) => element.shadowRoot!.querySelector(selector) as HTMLElement
  const $$ = (selector: string) => [...element.shadowRoot!.querySelectorAll(selector)] as HTMLElement[]
  return { h4b, element, $, $$, transport }
}

function type(input: HTMLElement, text: string) {
  ;(input as HTMLInputElement).value = text
  input.dispatchEvent(new Event('input'))
  input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  sessionStorage.clear()
})

describe('markdown', () => {
  it('renders a safe subset and escapes everything else', () => {
    expect(renderMarkdown('**oi** *você* `x`')).toBe('<p><strong>oi</strong> <em>você</em> <code>x</code></p>')
    expect(renderMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>')
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
    expect(renderMarkdown('[ok](https://a.com?a=1&b=2)')).toContain('href="https://a.com?a=1&amp;b=2"')
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a')
  })
})

describe('<h4b-chat>', () => {
  it('shows where the conversation is kept and lets users pick a retention or delete it', async () => {
    const { h4b, $, $$ } = await mount({ startOpen: true, language: 'en' })
    expect($('.privacy-toggle').hidden).toBe(true) // no storage, nothing to show
    let current: any = 'key'
    const listeners = new Set<() => void>()
    const set = vi.fn(async (r: any) => {
      current = r
      listeners.forEach((l) => l())
    })
    h4b.provide('retention', {
      get current() {
        return current
      },
      choices: ['key', 'tab', { ttlMinutes: 5 }],
      location: 'browser',
      encrypted: true,
      keyTtlMinutes: 30,
      set,
      subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
    })
    expect($('.privacy-toggle').hidden).toBe(false)
    $('.privacy-toggle').click()
    expect($('.privacy').hidden).toBe(false)
    expect($('.privacy').textContent).toContain('kept in this browser, encrypted')
    const options = $$('.privacy label')
    expect(options.map((o) => o.textContent!.trim())).toEqual([
      'Until 30 min without use',
      'Delete when this tab closes',
      'Delete after 5 min without use',
    ])
    expect(($$('.privacy input')[0] as HTMLInputElement).checked).toBe(true)
    const tab = $$('.privacy input')[1] as HTMLInputElement
    tab.checked = true
    tab.dispatchEvent(new Event('change'))
    expect(set).toHaveBeenCalledWith('tab')
    expect(($$('.privacy input')[1] as HTMLInputElement).checked).toBe(true)
    const reset = vi.spyOn(h4b, 'reset')
    ;($('.privacy .delete') as HTMLButtonElement).click()
    expect(reset).toHaveBeenCalled()
  })

  it('shows consent per purpose: toggles, or the state and a button to the consent tool', async () => {
    const rules = {
      id: 'r',
      purposes: {
        persistence: { default: 'pending' as const, label: { en: 'Keep this conversation', 'pt-BR': 'Guardar' } },
        review: { default: 'pending' as const, label: 'Human review' },
      },
    }
    const open = async (manage?: () => void) => {
      document.body.innerHTML = ''
      const h4b = createH4B({
        consent: { rules, channel: false, ...(manage ? { manage } : {}) },
        plugins: [widget({ pace: 0, startOpen: true, language: 'en' })],
      })
      await h4b.start()
      const root = (document.querySelector('h4b-chat') as H4BChatElement).shadowRoot!
      return { h4b, root }
    }
    const { h4b, root } = await open()
    const toggle = root.querySelector('.privacy-toggle') as HTMLButtonElement
    expect(toggle.hidden).toBe(false) // consent on, even without a storage
    toggle.click()
    expect(root.querySelector('.privacy')!.textContent).toContain('kept only on this page')
    const boxes = [...root.querySelectorAll('.consent input')] as HTMLInputElement[]
    expect([...root.querySelectorAll('.consent label')].map((l) => l.textContent!.trim())).toEqual([
      'Keep this conversation',
      'Human review',
    ])
    boxes[0]!.checked = true
    boxes[0]!.dispatchEvent(new Event('change'))
    await h4b.consent.ready()
    expect(h4b.consent.state('persistence')).toBe('granted')
    expect((root.querySelector('.consent input') as HTMLInputElement).checked).toBe(true)

    const manage = vi.fn()
    const managed = await open(manage)
    await managed.h4b.consent.set({ review: 'denied' })
    expect([...managed.root.querySelectorAll('.consent p')].map((p) => p.textContent)).toEqual([
      'Keep this conversation: not answered',
      'Human review: not allowed',
    ])
    ;(managed.root.querySelector('.manage-consent') as HTMLButtonElement).click()
    expect(manage).toHaveBeenCalled()
  })

  it('renders the conversation with markdown for the bot and plain text for the user', async () => {
    const { h4b, $, $$ } = await mount(
      { startOpen: true, botName: 'Hex' },
      scripted(() => [{ type: 'message.delta', messageId: 'a', delta: '**Olá** <b>x</b>' }]),
    )
    expect($('header').textContent).toContain('Hex')
    type($('#chat_input'), '<i>oi</i>')
    await h4b.when('turn.status', (s) => s.phase === 'done')
    await tick()
    const bubbles = $$('.msg')
    expect(bubbles[0]!.textContent).toBe('<i>oi</i>')
    expect(bubbles[1]!.querySelector('.text')!.innerHTML).toBe('<p><strong>Olá</strong> &lt;b&gt;x&lt;/b&gt;</p>')
  })

  it('opens and closes from the launcher, remembering the choice', async () => {
    const { element, $ } = await mount()
    expect($('.window').hidden).toBe(true)
    $('.launcher').click()
    expect(element.isOpen).toBe(true)
    expect(sessionStorage.getItem('h4b-widget-open')).toBe('1')
    $('.close').click()
    expect(element.isOpen).toBe(false)
  })

  it('stays open in inline layout', async () => {
    const host = document.createElement('div')
    host.id = 'chatbot'
    document.body.append(host)
    const { element, $ } = await mount({ container: '#chatbot', layout: 'inline' })
    expect(host.contains(element)).toBe(true)
    expect(element.isOpen).toBe(true)
    expect($('.close').hidden).toBe(true)
  })

  it('greets once when the conversation is empty (recorded in history)', async () => {
    const { h4b, $$ } = await mount({ greeting: ['Olá!', 'Como posso ajudar?'] })
    await tick(5)
    expect(h4b.messages.map((m) => m.role)).toEqual(['assistant', 'assistant'])
    expect($$('.msg').map((m) => m.textContent)).toEqual(['Olá!', 'Como posso ajudar?'])
  })

  it('shows quick replies of the last bot message and sends their payload', async () => {
    const transport = scripted((request) =>
      request.messages.length === 1
        ? [
            { type: 'message.delta', messageId: 'a', delta: 'Escolha:' },
            { type: 'message.part', messageId: 'a', part: { type: 'data', name: 'quick_replies', value: [{ label: 'Saldo', payload: '/saldo' }] } },
          ]
        : [{ type: 'message.delta', messageId: 'b', delta: 'R$ 10' }],
    )
    const { h4b, $, $$ } = await mount({ startOpen: true }, transport)
    type($('#chat_input'), 'menu')
    await h4b.when('turn.status', (s) => s.phase === 'done')
    await tick()
    const chip = $$('.chips button')[0]!
    expect(chip.textContent).toBe('Saldo')
    chip.click()
    await h4b.when('turn.status', (s) => s.phase === 'done')
    expect((transport.requests[1]!.messages.at(-1) as any).parts).toEqual([
      { type: 'text', text: 'Saldo' },
      { type: 'data', name: 'reply_payload', value: '/saldo' },
    ])
    await tick()
    expect($$('.chips button')).toHaveLength(0)
  })

  it('suggests menu commands while typing', async () => {
    const h4b = createH4B({
      plugins: [widget({ startOpen: true }), menu({ commands: [{ action: 'late', label: 'Pedidos atrasados', slash: 'atrasados' }] })],
      actions: [{ name: 'late', description: 'Late', handler: () => 3, describeResult: (n) => `${n} atrasados` }],
    })
    await h4b.start()
    const root = document.querySelector('h4b-chat')!.shadowRoot!
    const input = root.querySelector('#chat_input') as HTMLInputElement
    input.value = '/atr'
    input.dispatchEvent(new Event('input'))
    const chip = root.querySelector('.chips button') as HTMLButtonElement
    expect(chip.textContent).toBe('Pedidos atrasados')
    chip.click()
    const status = await h4b.when('turn.status', (s) => s.phase === 'done')
    expect(status.route).toBe('direct')
  })

  it('labels actions by who ran them and paces bot messages that arrive together', async () => {
    vi.useFakeTimers()
    const transport = scripted(() => [
      { type: 'message.delta', messageId: 'a', delta: 'um' },
      { type: 'message.end', messageId: 'a' },
      { type: 'message.delta', messageId: 'b', delta: 'dois' },
      { type: 'message.end', messageId: 'b' },
    ])
    const h4b = createH4B({
      plugins: [widget({ startOpen: true, pace: 500 })],
      actions: [{ name: 'ping', description: 'Ping', handler: () => 'pong' }],
    })
    h4b.provide('transport', transport)
    await h4b.start()
    const root = document.querySelector('h4b-chat')!.shadowRoot!
    await h4b.runAction('ping', {}, { origin: 'agent' })
    expect(root.querySelector('.action')!.textContent).toContain('ping')
    expect(root.querySelector('.action')!.textContent).toContain('external agent')

    void h4b.ask('oi')
    await vi.advanceTimersByTimeAsync(10)
    const visible = () => [...root.querySelectorAll('.msg.assistant:not(.pending):not([hidden])')].map((e) => e.textContent)
    expect(visible()).toEqual(['um'])
    await vi.advanceTimersByTimeAsync(600)
    expect(visible()).toEqual(['um', 'dois'])
    vi.useRealTimers()
  })

  it('shows voice controls only when a voice service exists', async () => {
    const { $ } = await mount()
    expect($('#speech_button').hidden).toBe(true)

    document.body.innerHTML = ''
    const listeners = new Set<() => void>()
    let state = { supported: { stt: true, tts: true }, mode: 'push-to-talk', listening: false, speaking: false, partial: '', output: 'auto' }
    const voice = {
      getState: () => state,
      subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
      listen: vi.fn(async () => {
        state = { ...state, listening: true, partial: 'mostra' }
        listeners.forEach((l) => l())
      }),
      stop: vi.fn(),
      toggle: vi.fn(),
      setOutput: vi.fn(),
      cancelSpeech: vi.fn(),
    }
    const h4b = createH4B({ plugins: [widget({ startOpen: true })] })
    await h4b.start()
    // Provided after the widget mounted (e.g. plugin order): controls still appear.
    h4b.provide('voice' as never, voice as never)
    const root = document.querySelector('h4b-chat')!.shadowRoot!
    const mic = root.querySelector('#speech_button') as HTMLButtonElement
    expect(mic.hidden).toBe(false)
    mic.dispatchEvent(new Event('pointerdown'))
    await tick()
    expect(voice.listen).toHaveBeenCalledWith({ until: 'stop' })
    expect(root.querySelector('.partial')!.textContent).toBe('“mostra”')
    mic.dispatchEvent(new Event('pointerup'))
    expect(voice.stop).toHaveBeenCalled()
    ;(root.querySelector('.speaker') as HTMLButtonElement).click()
    expect(voice.setOutput).toHaveBeenCalledWith('text')
  })

  it('tells the user why listening failed, by error code', async () => {
    document.body.innerHTML = ''
    const listeners = new Set<() => void>()
    let state: Record<string, unknown> = { supported: { stt: true, tts: false }, mode: 'push-to-talk', listening: false, speaking: false, partial: '', output: 'auto' }
    const update = (patch: Record<string, unknown>) => {
      state = { ...state, ...patch }
      listeners.forEach((l) => l())
    }
    const voice = {
      getState: () => state,
      subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
      listen: vi.fn(),
      stop: vi.fn(),
      toggle: vi.fn(),
      setOutput: vi.fn(),
      cancelSpeech: vi.fn(),
    }
    const h4b = createH4B({ plugins: [widget({ startOpen: true, language: 'en', strings: { micDenied: 'Unblock the mic' } })] })
    await h4b.start()
    h4b.provide('voice' as never, voice as never)
    const partial = document.querySelector('h4b-chat')!.shadowRoot!.querySelector('.partial')!

    update({ error: { code: 'not-allowed' } })
    expect(partial.textContent).toBe('Unblock the mic')
    update({ error: { code: 'service-not-allowed' } })
    expect(partial.textContent).toContain('dictation')
    update({ error: { code: 'unknown' } })
    expect(partial.textContent).toBe('Voice is not available right now.')
    update({ listening: true, error: undefined })
    expect(partial.textContent).toBe('Listening…')
    update({ listening: false })
    expect(partial.textContent).toBe('')
  })
})

describe('<h4b-chat> media', () => {
  it('attaches pasted files with the typed text as the question', async () => {
    const attach = vi.fn()
    const h4b = createH4B({ plugins: [widget({ startOpen: true })] })
    await h4b.start()
    const root = document.querySelector('h4b-chat')!.shadowRoot!
    expect((root.querySelector('.attach') as HTMLElement).hidden).toBe(true)
    h4b.provide('files' as never, { attach, pick: vi.fn() } as never)
    expect((root.querySelector('.attach') as HTMLElement).hidden).toBe(false)
    const input = root.querySelector('#chat_input') as HTMLInputElement
    input.value = 'o que é isto?'
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const paste = new Event('paste', { cancelable: true }) as any
    paste.clipboardData = { files: [file] }
    input.dispatchEvent(paste)
    expect(attach).toHaveBeenCalledWith([file], 'o que é isto?')
    expect(input.value).toBe('')
  })

  it('opens a camera preview and captures', async () => {
    const camera = { getState: () => ({ supported: true }), open: vi.fn(async () => {}), close: vi.fn(), capture: vi.fn(async () => {}) }
    const h4b = createH4B({ plugins: [widget({ startOpen: true })] })
    h4b.provide('camera' as never, camera as never)
    await h4b.start()
    const root = document.querySelector('h4b-chat')!.shadowRoot!
    ;(root.querySelector('.cam') as HTMLButtonElement).click()
    await tick()
    expect((root.querySelector('.camera') as HTMLElement).hidden).toBe(false)
    expect(camera.open).toHaveBeenCalledWith(root.querySelector('.camera video'))
    ;(root.querySelector('.snap') as HTMLButtonElement).click()
    await tick()
    expect(camera.capture).toHaveBeenCalled()
    expect(camera.close).toHaveBeenCalled()
    expect((root.querySelector('.camera') as HTMLElement).hidden).toBe(true)
  })
})

describe('<h4b-chat> rich content', () => {
  it('renders the built-in gallery and custom renderers, skipping unsafe URLs', async () => {
    const transport = scripted(() => [
      { type: 'message.delta', messageId: 'a', delta: 'Veja:' },
      { type: 'ui.render', messageId: 'a', component: 'gallery', props: { title: 'Fotos', images: ['https://x.test/1.jpg', 'javascript:alert(1)'] } },
      { type: 'ui.render', messageId: 'a', component: 'price', props: { value: 10 } },
    ])
    const h4b = createH4B({
      plugins: [widget({ startOpen: true, renderers: { price: ({ value }) => Object.assign(document.createElement('strong'), { textContent: `R$ ${value}` }) } })],
    })
    h4b.provide('transport', transport)
    await h4b.start()
    await h4b.ask('fotos')
    const bubble = document.querySelector('h4b-chat')!.shadowRoot!.querySelector('.msg.assistant')!
    expect(bubble.querySelector('figcaption')!.textContent).toBe('Fotos')
    expect([...bubble.querySelectorAll('.gallery img')].map((i) => i.getAttribute('src'))).toEqual(['https://x.test/1.jpg'])
    expect(bubble.querySelector('strong')!.textContent).toBe('R$ 10')
  })
})


describe('<h4b-chat> rich parts are stable', () => {
  it('keeps rendered components while the text of the same message keeps changing', async () => {
    const created = vi.fn(() => document.createElement('section'))
    const transport = scripted(() => [
      { type: 'message.start', messageId: 'a' },
      { type: 'ui.render', messageId: 'a', component: 'app', props: {} },
      { type: 'message.delta', messageId: 'a', delta: 'um ' },
      { type: 'message.delta', messageId: 'a', delta: 'dois' },
      { type: 'message.end', messageId: 'a' },
    ])
    const h4b = createH4B({ plugins: [widget({ startOpen: true, renderers: { app: created } })] })
    h4b.provide('transport', transport)
    await h4b.start()
    await h4b.ask('x')
    const bubble = document.querySelector('h4b-chat')!.shadowRoot!.querySelector('.msg.assistant')!
    expect(created).toHaveBeenCalledOnce()
    expect(bubble.querySelectorAll('section')).toHaveLength(1)
    expect(bubble.querySelector('.text')!.textContent).toBe('um dois')
  })
})


describe('<h4b-chat> queued messages', () => {
  it('shows messages sent during a running turn right away, dimmed', async () => {
    let release!: () => void
    const transport: any = {
      name: 'slow',
      async *run() {
        await new Promise<void>((r) => (release = r))
        yield { type: 'message.delta', messageId: `m${Math.random()}`, delta: 'ok' }
      },
    }
    const { h4b, $, $$ } = await mount({ startOpen: true }, transport)
    type($('#chat_input'), 'primeira')
    await tick(5)
    type($('#chat_input'), 'segunda')
    await tick(5)
    expect($$('.msg.queued').map((e) => e.textContent)).toEqual(['segunda'])
    release()
    await tick(10)
    release()
    await h4b.when('turn.status', (s) => s.phase === 'done' && textOf(s.signal!.parts) === 'segunda')
    await tick()
    expect($$('.msg.queued')).toHaveLength(0)
    expect($$('.msg.user').map((e) => e.textContent)).toEqual(['primeira', 'segunda'])
  })
})
