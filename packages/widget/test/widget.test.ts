// @vitest-environment jsdom
import { createH4B, type Transport, type TurnRequest } from '@handsforbots/core'
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
    expect(bubbles[1]!.innerHTML).toBe('<p><strong>Olá</strong> &lt;b&gt;x&lt;/b&gt;</p>')
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
    expect(root.querySelector('.action')!.textContent).toContain('browser agent')

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
    expect(voice.listen).toHaveBeenCalled()
    expect(root.querySelector('.partial')!.textContent).toBe('“mostra”')
    mic.dispatchEvent(new Event('pointerup'))
    expect(voice.stop).toHaveBeenCalled()
    ;(root.querySelector('.speaker') as HTMLButtonElement).click()
    expect(voice.setOutput).toHaveBeenCalledWith('text')
  })
})
