// @vitest-environment jsdom
import { createH4B, textOf, type Transport } from '@handsforbots/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SpeechError,
  splitSentences,
  voice,
  webSpeechSTT,
  type SpeechToText,
  type SttHandlers,
  type TextToSpeech,
  type VoiceService,
} from '../src/index.js'

/** STT whose sessions the test drives by hand. */
function fakeSTT(name = 'fake', options: { supported?: boolean; failWith?: SpeechError; lazyStop?: boolean } = {}) {
  const sessions: { handlers: SttHandlers; continuous: boolean; stop: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }[] = []
  const provider: SpeechToText = {
    name,
    capabilities: { partials: true, continuous: true },
    isSupported: () => options.supported ?? true,
    listen(listenOptions, handlers) {
      if (options.failWith) throw options.failWith
      const session = {
        handlers,
        continuous: listenOptions.continuous,
        stop: vi.fn(() => !options.lazyStop && handlers.onEnd()),
        abort: vi.fn(() => handlers.onEnd()),
      }
      sessions.push(session)
      return session
    },
  }
  return { provider, sessions, last: () => sessions.at(-1)! }
}

function fakeTTS() {
  const spoken: string[] = []
  let finish: (() => void) | undefined
  const provider: TextToSpeech & { finish(): void } = {
    name: 'fake-tts',
    isSupported: () => true,
    speak(text, options) {
      spoken.push(text)
      return new Promise((resolve) => {
        finish = resolve
        options.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    },
    cancel: vi.fn(() => finish?.()),
    finish: () => finish?.(),
  }
  return { provider, spoken }
}

const replyTransport: Transport = {
  name: 'reply',
  async *run(request) {
    yield { type: 'message.start', messageId: `m-${request.turnId}` }
    yield { type: 'message.delta', messageId: `m-${request.turnId}`, delta: `ouvi: ${textOf(request.messages.at(-1)!)}` }
    yield { type: 'message.end', messageId: `m-${request.turnId}` }
  },
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

async function setup(options: Parameters<typeof voice>[0] = {}) {
  const h4b = createH4B({ plugins: [voice({ language: 'pt-BR', ...options })] })
  h4b.provide('transport', replyTransport)
  await h4b.start()
  return { h4b, voice: h4b.get('voice') as VoiceService }
}

afterEach(() => vi.useRealTimers())

describe('voice input', () => {
  it('turns final transcripts into transcript signals and answers with voice', async () => {
    const stt = fakeSTT()
    const tts = fakeTTS()
    const { h4b, voice: v } = await setup({ stt: stt.provider, tts: tts.provider })

    await v.listen()
    expect(v.getState().listening).toBe(true)
    stt.last().handlers.onPartial?.('mostra os')
    expect(v.getState().partial).toBe('mostra os')
    stt.last().handlers.onFinal('mostra os pedidos', { confidence: 0.9 })
    stt.last().handlers.onEnd()
    await tick(5)

    expect(h4b.messages[0]).toMatchObject({ role: 'user', modality: 'transcript', source: 'voice' })
    expect(v.getState()).toMatchObject({ lastInput: 'voice', listening: false, partial: '' })
    expect(tts.spoken).toEqual(['ouvi: mostra os pedidos'])
  })

  it('answers typed messages with text only (output follows input)', async () => {
    const tts = fakeTTS()
    const { h4b } = await setup({ stt: fakeSTT().provider, tts: tts.provider })
    await h4b.ask('digitado')
    expect(tts.spoken).toEqual([])
  })

  it('respects explicit output preferences', async () => {
    const tts = fakeTTS()
    const { h4b, voice: v } = await setup({ tts: tts.provider, output: 'voice' })
    await h4b.ask('a')
    await tick()
    tts.provider.finish()
    v.setOutput('text')
    await h4b.ask('b')
    expect(tts.spoken).toEqual(['ouvi: a'])
  })

  it('barges in: the user talking over the bot stops the speech', async () => {
    const stt = fakeSTT()
    const tts = fakeTTS()
    const { h4b, voice: v } = await setup({ stt: stt.provider, tts: tts.provider, output: 'voice', mode: 'hands-free' })
    await v.listen()
    void h4b.ask('conte uma história')
    await tick(5)
    expect(v.getState().speaking).toBe(true)
    stt.last().handlers.onPartial?.('pa')
    expect(v.getState().speaking).toBe(true) // too short to count
    stt.last().handlers.onPartial?.('para aí')
    expect(v.getState().speaking).toBe(false)
    expect(tts.provider.cancel).toHaveBeenCalled()
  })

  it('without barge-in, pauses recognition while speaking and resumes after (hands-free)', async () => {
    const stt = fakeSTT()
    const tts = fakeTTS()
    const { voice: v } = await setup({ stt: stt.provider, tts: tts.provider, mode: 'hands-free', bargeIn: false })
    await v.listen()
    const first = stt.last()
    const speaking = v.speak('olá')
    await tick()
    expect(first.abort).toHaveBeenCalled()
    tts.provider.finish()
    await speaking
    await tick()
    expect(stt.sessions).toHaveLength(2)
  })
})

describe('listening modes', () => {
  it('hands-free restarts after the browser ends a session; push-to-talk does not', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT()
    const { voice: v } = await setup({ stt: stt.provider, mode: 'hands-free' })
    await v.listen()
    expect(stt.last().continuous).toBe(true)
    stt.last().handlers.onEnd()
    await vi.advanceTimersByTimeAsync(300)
    expect(stt.sessions).toHaveLength(2)

    v.setMode('push-to-talk')
    await v.listen()
    expect(stt.last().continuous).toBe(false)
    const count = stt.sessions.length
    stt.last().handlers.onEnd()
    await vi.advanceTimersByTimeAsync(300)
    expect(stt.sessions).toHaveLength(count)
  })

  it('stop() lets the provider flush and end the session', async () => {
    const stt = fakeSTT()
    const { voice: v } = await setup({ stt: stt.provider })
    await v.toggle()
    expect(v.getState().listening).toBe(true)
    await v.toggle()
    expect(stt.last().stop).toHaveBeenCalled()
    expect(v.getState().listening).toBe(false)
  })
})

describe('push-to-talk release', () => {
  it('turns the mic off immediately and still uses the final transcript that arrives later', async () => {
    const stt = fakeSTT('slow', { lazyStop: true })
    const { h4b, voice: v } = await setup({ stt: stt.provider })
    await v.listen()
    v.stop()
    expect(v.getState().listening).toBe(false)
    stt.last().handlers.onFinal('chegou depois')
    stt.last().handlers.onEnd()
    await tick(5)
    expect(h4b.messages[0]).toMatchObject({ role: 'user', modality: 'transcript' })
  })

  it('pressing again while flushing starts a fresh session; late events of the old one are ignored', async () => {
    const stt = fakeSTT('slow', { lazyStop: true })
    const { voice: v } = await setup({ stt: stt.provider })
    await v.listen()
    const first = stt.last()
    v.stop()
    await v.listen()
    expect(first.abort).toHaveBeenCalled()
    expect(stt.sessions).toHaveLength(2)
    first.handlers.onPartial?.('velho')
    first.handlers.onEnd()
    expect(v.getState()).toMatchObject({ listening: true, partial: '' })
  })

  it('aborts a session whose provider never ends after stop', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT('stuck', { lazyStop: true })
    const { voice: v } = await setup({ stt: stt.provider })
    await v.listen()
    v.stop()
    await vi.advanceTimersByTimeAsync(3100)
    expect(stt.last().abort).toHaveBeenCalled()
  })
})

describe('hold-to-talk', () => {
  it("until: 'stop' keeps listening across pauses and sends everything on release", async () => {
    const stt = fakeSTT()
    const { h4b, voice: v } = await setup({ stt: stt.provider })
    const signals: unknown[] = []
    h4b.on('signal', (signal) => void signals.push(signal))
    await v.listen({ until: 'stop' })
    expect(stt.last().continuous).toBe(true)
    stt.last().handlers.onFinal('mostra os pedidos', { confidence: 0.9 })
    stt.last().handlers.onPartial?.('de ontem')
    expect(v.getState().partial).toBe('mostra os pedidos de ontem')
    stt.last().handlers.onFinal('de ontem', { confidence: 0.7 })
    await tick(5)
    expect(h4b.messages).toHaveLength(0)
    expect(v.getState().listening).toBe(true)

    v.stop()
    await tick(5)
    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({ modality: 'transcript', meta: { confidence: 0.7, stt: 'fake' } })
    expect(h4b.messages[0]).toMatchObject({ role: 'user', modality: 'transcript' })
    expect(textOf(h4b.messages[0]!)).toBe('mostra os pedidos de ontem')
    expect(h4b.messages.filter((m) => m.role === 'user')).toHaveLength(1)
  })

  it('starts a new session when the browser ends one while the user still holds', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT()
    const { h4b, voice: v } = await setup({ stt: stt.provider })
    await v.listen({ until: 'stop' })
    stt.last().handlers.onFinal('primeira parte')
    stt.last().handlers.onEnd()
    expect(v.getState()).toMatchObject({ listening: true, partial: 'primeira parte' })
    await vi.advanceTimersByTimeAsync(300)
    expect(stt.sessions).toHaveLength(2)
    stt.last().handlers.onFinal('segunda parte')
    v.stop()
    await vi.advanceTimersByTimeAsync(10)
    expect(textOf(h4b.messages[0]!)).toBe('primeira parte segunda parte')
  })

  it('a final transcript that arrives after release is included', async () => {
    const stt = fakeSTT('slow', { lazyStop: true })
    const { h4b, voice: v } = await setup({ stt: stt.provider })
    await v.listen({ until: 'stop' })
    stt.last().handlers.onFinal('abre')
    v.stop()
    expect(v.getState().listening).toBe(false)
    stt.last().handlers.onFinal('o carrinho')
    stt.last().handlers.onEnd()
    await tick(5)
    expect(textOf(h4b.messages[0]!)).toBe('abre o carrinho')
  })

  it('the default push-to-talk still sends on the first pause', async () => {
    const stt = fakeSTT()
    const { voice: v } = await setup({ stt: stt.provider })
    await v.listen()
    expect(stt.last().continuous).toBe(false)
  })
})

describe('cancel', () => {
  it('turns the mic off and sends nothing', async () => {
    const stt = fakeSTT()
    const { h4b, voice: v } = await setup({ stt: stt.provider })
    await v.listen()
    stt.last().handlers.onPartial?.('esquece')
    v.cancel()
    expect(stt.last().abort).toHaveBeenCalled()
    expect(v.getState()).toMatchObject({ listening: false, partial: '' })
    stt.last().handlers.onFinal('esquece isso')
    await tick(5)
    expect(h4b.messages).toHaveLength(0)
  })

  it('discards a hold-to-talk press, including what was already transcribed', async () => {
    const stt = fakeSTT('slow', { lazyStop: true })
    const { h4b, voice: v } = await setup({ stt: stt.provider })
    await v.listen({ until: 'stop' })
    stt.last().handlers.onFinal('não manda')
    v.cancel()
    stt.last().handlers.onFinal('nada disso')
    stt.last().handlers.onEnd()
    await tick(5)
    expect(h4b.messages).toHaveLength(0)
  })

  it('discards an utterance still flushing after release', async () => {
    const stt = fakeSTT('slow', { lazyStop: true })
    const { h4b, voice: v } = await setup({ stt: stt.provider })
    await v.listen()
    v.stop()
    v.cancel()
    stt.last().handlers.onFinal('tarde demais')
    await tick(5)
    expect(h4b.messages).toHaveLength(0)
  })

  it('stops hands-free listening for good', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT()
    const { voice: v } = await setup({ stt: stt.provider, mode: 'hands-free' })
    await v.listen()
    v.cancel()
    await vi.advanceTimersByTimeAsync(500)
    expect(stt.sessions).toHaveLength(1)
    expect(v.getState().listening).toBe(false)
  })
})

describe('providers', () => {
  it('skips unsupported providers and falls back when one fails', async () => {
    const unsupported = fakeSTT('cloud', { supported: false })
    const broken = fakeSTT('ws', { failWith: new SpeechError('network', 'down') })
    const browser = fakeSTT('browser')
    const { voice: v } = await setup({ stt: [unsupported.provider, broken.provider, browser.provider] })
    expect(v.getState().stt).toBe('ws')
    await v.listen()
    expect(v.getState()).toMatchObject({ stt: 'browser', listening: true })
  })

  it('stops trying when the microphone is not allowed, and reports it on the error event', async () => {
    const denied = fakeSTT('mic', { failWith: new SpeechError('not-allowed') })
    const other = fakeSTT('other')
    const { h4b, voice: v } = await setup({ stt: [denied.provider, other.provider] })
    const errors: { error: unknown; source: string }[] = []
    h4b.on('error', (payload) => void errors.push(payload))
    await v.listen()
    expect(errors).toEqual([{ error: expect.objectContaining({ code: 'not-allowed' }), source: 'voice' }])
    expect(v.getState()).toMatchObject({ listening: false, error: expect.objectContaining({ code: 'not-allowed' }) })
    expect(other.sessions).toHaveLength(0)
  })

  it('falls back when the speech service is off but the microphone is fine', async () => {
    const browser = fakeSTT('browser')
    const cloud = fakeSTT('cloud')
    const { voice: v } = await setup({ stt: [browser.provider, cloud.provider] })
    await v.listen()
    browser.last().handlers.onError(new SpeechError('service-not-allowed'))
    browser.last().handlers.onEnd()
    expect(cloud.sessions).toHaveLength(1)
    expect(v.getState()).toMatchObject({ stt: 'cloud', listening: true, error: undefined })
  })

  it('reports a disabled speech service and stops retrying when there is no fallback', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT()
    const { voice: v } = await setup({ stt: stt.provider })
    await v.listen({ until: 'stop' })
    stt.last().handlers.onError(new SpeechError('service-not-allowed'))
    stt.last().handlers.onEnd()
    await vi.advanceTimersByTimeAsync(300)
    expect(stt.sessions).toHaveLength(1)
    expect(v.getState()).toMatchObject({
      listening: false,
      error: expect.objectContaining({ code: 'service-not-allowed' }),
    })
  })

  it('reports no support when nothing is available', async () => {
    const { voice: v } = await setup({ stt: fakeSTT('x', { supported: false }).provider })
    expect(v.getState().supported).toEqual({ stt: false, tts: false })
    await v.listen()
    expect(v.getState().error?.code).toBe('not-supported')
  })
})

describe('web speech wrapper', () => {
  it('maps browser results and errors', () => {
    const instances: any[] = []
    ;(window as any).webkitSpeechRecognition = class {
      start = vi.fn()
      stop = vi.fn()
      abort = vi.fn()
      constructor() {
        instances.push(this)
      }
    }
    const stt = webSpeechSTT()
    expect(stt.isSupported()).toBe(true)
    const handlers = { onPartial: vi.fn(), onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() }
    stt.listen({ language: 'pt-BR', continuous: true }, handlers)
    const rec = instances[0]
    expect(rec).toMatchObject({ lang: 'pt-BR', continuous: true, interimResults: true })

    const result = (transcript: string, isFinal: boolean, confidence = 0.8) =>
      Object.assign([{ transcript, confidence }], { isFinal })
    rec.onresult({ resultIndex: 0, results: [result('olá mun', false)] })
    rec.onresult({ resultIndex: 0, results: [result(' olá mundo ', true, 0.93)] })
    rec.onerror({ error: 'not-allowed' })
    rec.onerror({ error: 'service-not-allowed' })
    rec.onerror({ error: 'aborted' })
    rec.onend()

    expect(handlers.onPartial).toHaveBeenCalledWith('olá mun')
    expect(handlers.onFinal).toHaveBeenCalledWith('olá mundo', { confidence: 0.93 })
    expect(handlers.onError).toHaveBeenCalledTimes(2)
    expect(handlers.onError.mock.calls[0]![0]).toMatchObject({ code: 'not-allowed' })
    expect(handlers.onError.mock.calls[1]![0]).toMatchObject({ code: 'service-not-allowed', recoverable: true })
    expect(handlers.onEnd).toHaveBeenCalled()
    delete (window as any).webkitSpeechRecognition
  })

  it('is unsupported outside a secure context', () => {
    ;(window as any).webkitSpeechRecognition = class {}
    const secure = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    expect(webSpeechSTT().isSupported()).toBe(false)
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    expect(webSpeechSTT().isSupported()).toBe(true)
    if (secure) Object.defineProperty(window, 'isSecureContext', secure)
    else delete (window as any).isSecureContext
    delete (window as any).webkitSpeechRecognition
  })

  it('listens one utterance per session on Android instead of using continuous recognition', () => {
    const instances: any[] = []
    ;(window as any).webkitSpeechRecognition = class {
      start = vi.fn()
      constructor() {
        instances.push(this)
      }
    }
    const handlers = { onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() }
    const agent = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36')

    const auto = webSpeechSTT()
    expect(auto.capabilities.continuous).toBe(false)
    auto.listen({ language: 'pt-BR', continuous: true }, handlers)
    expect(instances.at(-1).continuous).toBe(false)
    webSpeechSTT({ continuous: true }).listen({ language: 'pt-BR', continuous: true }, handlers)
    expect(instances.at(-1).continuous).toBe(true)

    agent.mockRestore()
    webSpeechSTT({ continuous: false }).listen({ language: 'pt-BR', continuous: true }, handlers)
    expect(instances.at(-1).continuous).toBe(false)
    delete (window as any).webkitSpeechRecognition
  })

  it('splits long text into sentence chunks', () => {
    const long = 'Primeira frase. Segunda frase! Terceira? ' + 'x'.repeat(300) + '. Fim.'
    const chunks = splitSentences(long, 60)
    expect(chunks[0]).toBe('Primeira frase. Segunda frase! Terceira?')
    expect(chunks.at(-1)).toBe('Fim.')
  })
})
