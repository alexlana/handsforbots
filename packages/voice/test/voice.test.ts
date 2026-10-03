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
function fakeSTT(name = 'fake', options: { supported?: boolean; failWith?: SpeechError } = {}) {
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
        stop: vi.fn(() => handlers.onEnd()),
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

  it('stops trying when the microphone is not allowed', async () => {
    const denied = fakeSTT('mic', { failWith: new SpeechError('not-allowed') })
    const other = fakeSTT('other')
    const { voice: v } = await setup({ stt: [denied.provider, other.provider] })
    await v.listen()
    expect(v.getState()).toMatchObject({ listening: false, error: expect.objectContaining({ code: 'not-allowed' }) })
    expect(other.sessions).toHaveLength(0)
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
    rec.onerror({ error: 'aborted' })
    rec.onend()

    expect(handlers.onPartial).toHaveBeenCalledWith('olá mun')
    expect(handlers.onFinal).toHaveBeenCalledWith('olá mundo', { confidence: 0.93 })
    expect(handlers.onError).toHaveBeenCalledOnce()
    expect(handlers.onError.mock.calls[0]![0]).toMatchObject({ code: 'not-allowed' })
    expect(handlers.onEnd).toHaveBeenCalled()
    delete (window as any).webkitSpeechRecognition
  })

  it('splits long text into sentence chunks', () => {
    const long = 'Primeira frase. Segunda frase! Terceira? ' + 'x'.repeat(300) + '. Fim.'
    const chunks = splitSentences(long, 60)
    expect(chunks[0]).toBe('Primeira frase. Segunda frase! Terceira?')
    expect(chunks.at(-1)).toBe('Fim.')
  })
})
