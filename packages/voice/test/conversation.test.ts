// @vitest-environment jsdom
import { createH4B, textOf, type Transport, type TurnRequest } from '@handsforbots/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  httpEndOfTurn,
  voice,
  type EndOfTurn,
  type SpeechToText,
  type SttHandlers,
  type TextToSpeech,
  type VoiceDecision,
  type VoiceOptions,
  type VoiceService,
} from '../src/index.js'

/** STT whose sessions the test drives by hand. */
function fakeSTT(capabilities: SpeechToText['capabilities'] = {}) {
  const sessions: { handlers: SttHandlers }[] = []
  const provider: SpeechToText = {
    name: 'fake',
    capabilities: { partials: true, continuous: true, ...capabilities },
    isSupported: () => true,
    listen(_options, handlers) {
      const session = { handlers, stop: vi.fn(() => handlers.onEnd()), abort: vi.fn(() => handlers.onEnd()) }
      sessions.push(session)
      return session
    },
  }
  return { provider, last: () => sessions.at(-1)!.handlers }
}

/** TTS that finishes each chunk when the test says so. */
function fakeTTS() {
  const spoken: string[] = []
  const finishers: (() => void)[] = []
  const provider: TextToSpeech & { finish(): void } = {
    name: 'fake-tts',
    isSupported: () => true,
    speak(text, options) {
      spoken.push(text)
      return new Promise((resolve) => {
        finishers.push(resolve)
        options.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    },
    cancel: vi.fn(() => finishers.splice(0).forEach((f) => f())),
    finish: () => finishers.shift()?.(),
  }
  return { provider, spoken }
}

/** Transport that echoes, or streams `script` and then waits until aborted. */
function transport(script?: string[]): Transport & { requests: TurnRequest[] } {
  const requests: TurnRequest[] = []
  return {
    name: 'test',
    requests,
    async *run(request, signal) {
      requests.push(structuredClone(request))
      const messageId = `m-${request.turnId}`
      if (!script) {
        yield { type: 'message.delta', messageId, delta: `ouvi: ${textOf(request.messages.at(-1)!)}` }
        return
      }
      for (const delta of script) yield { type: 'message.delta', messageId, delta }
      if (!signal.aborted) await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
    },
  }
}

async function setup(options: VoiceOptions, backend = transport()) {
  const h4b = createH4B({ plugins: [voice({ language: 'pt-BR', mode: 'hands-free', ...options })] })
  h4b.provide('transport', backend)
  await h4b.start()
  const v = h4b.get('voice') as VoiceService
  const decisions: VoiceDecision[] = []
  h4b.on('voice.decision', (d) => decisions.push(d))
  return { h4b, voice: v, decisions, backend }
}

const userTexts = (h4b: ReturnType<typeof createH4B>) => h4b.messages.filter((m) => m.role === 'user').map(textOf)
const flush = () => vi.advanceTimersByTimeAsync(0)

afterEach(() => vi.useRealTimers())

describe('hands-free end of turn', () => {
  it('joins finals separated by short pauses and sends them after the silence', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT()
    const { h4b, voice: v } = await setup({ stt: stt.provider })
    await v.listen()
    stt.last().onFinal('eu queria')
    expect(v.getState()).toMatchObject({ phase: 'waitingEndOfTurn', partial: 'eu queria' })
    expect(v.getState().endOfTurnAt).toBe(Date.now() + 800)
    await vi.advanceTimersByTimeAsync(500)
    stt.last().onPartial?.('saber')
    expect(v.getState()).toMatchObject({ phase: 'userSpeaking', partial: 'eu queria saber', endOfTurnAt: undefined })
    stt.last().onFinal('saber o preço')
    await vi.advanceTimersByTimeAsync(799)
    expect(h4b.messages).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(userTexts(h4b)).toEqual(['eu queria saber o preço'])
    expect(v.getState()).toMatchObject({ phase: 'listening', partial: '' })
  })

  it('sends at once when the model says the turn is over, and waits longer when it is not', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT()
    const predict = vi.fn((input: { partial: string }) => (input.partial.endsWith('preço') ? 0.9 : 0.1))
    const model: EndOfTurn = { name: 'model', input: 'text', isSupported: () => true, predict }
    const { h4b, voice: v, decisions } = await setup({ stt: stt.provider, endOfTurn: model })
    await v.listen()
    stt.last().onFinal('eu queria')
    await vi.advanceTimersByTimeAsync(300)
    expect(predict).toHaveBeenCalledWith(expect.objectContaining({ partial: 'eu queria', language: 'pt-BR' }), expect.any(AbortSignal))
    expect(h4b.messages).toHaveLength(0) // incomplete: waits up to maxSilence
    expect(v.getState().endOfTurnAt).toBe(Date.now() - 300 + 2000)
    stt.last().onFinal('saber o preço')
    await vi.advanceTimersByTimeAsync(300)
    expect(userTexts(h4b)).toEqual(['eu queria saber o preço'])
    expect(decisions.at(-1)).toMatchObject({ kind: 'end-of-turn', reason: 'model', probability: 0.9 })
  })

  it('sends after maxSilence when the model keeps saying the turn is not over', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT()
    const model: EndOfTurn = { name: 'model', input: 'text', isSupported: () => true, predict: () => 0 }
    const { h4b, voice: v } = await setup({ stt: stt.provider, endOfTurn: model, turn: { maxSilence: 1500 } })
    await v.listen()
    stt.last().onFinal('então')
    await vi.advanceTimersByTimeAsync(1499)
    expect(h4b.messages).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(userTexts(h4b)).toEqual(['então'])
  })

  it('falls back to silence when the model is slow or fails', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT()
    const model: EndOfTurn = { name: 'slow', input: 'text', isSupported: () => true, predict: () => new Promise(() => {}) }
    const { h4b, voice: v } = await setup({ stt: stt.provider, endOfTurn: model, turn: { timeout: 200 } })
    await v.listen()
    stt.last().onFinal('oi')
    await vi.advanceTimersByTimeAsync(300 + 200)
    expect(v.getState().endOfTurnAt).toBe(Date.now() - 500 + 800)
    await vi.advanceTimersByTimeAsync(300)
    expect(userTexts(h4b)).toEqual(['oi'])
  })

  it('uses the end of turn reported by the recognizer instead of a model', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT({ endOfTurn: true })
    const predict = vi.fn(() => 1)
    const { h4b, voice: v } = await setup({
      stt: stt.provider,
      endOfTurn: { name: 'model', input: 'text', isSupported: () => true, predict },
    })
    await v.listen()
    stt.last().onFinal('eu queria', { endOfTurn: false })
    await vi.advanceTimersByTimeAsync(1000)
    expect(h4b.messages).toHaveLength(0)
    stt.last().onFinal('saber o preço', { endOfTurn: true })
    await flush()
    expect(userTexts(h4b)).toEqual(['eu queria saber o preço'])
    expect(predict).not.toHaveBeenCalled()
  })

  it('turns the model off and on at runtime, and skips it without consent', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT()
    const predict = vi.fn(() => 1)
    const model: EndOfTurn = { name: 'model', input: 'text', consent: 'voice-ai', isSupported: () => true, predict }
    const h4b = createH4B({
      consent: { initial: { 'voice-ai': false } },
      plugins: [voice({ language: 'pt-BR', mode: 'hands-free', stt: stt.provider, endOfTurn: model })],
    })
    h4b.provide('transport', transport())
    await h4b.start()
    const v = h4b.get('voice') as VoiceService
    await v.listen()
    stt.last().onFinal('um')
    await vi.advanceTimersByTimeAsync(800)
    expect(predict).not.toHaveBeenCalled()
    await h4b.consent.set({ 'voice-ai': true })
    stt.last().onFinal('dois')
    await vi.advanceTimersByTimeAsync(300)
    expect(predict).toHaveBeenCalledTimes(1)
    v.setEndOfTurn(null)
    await flush()
    expect(v.getState().endOfTurn).toBeUndefined()
    v.configure({ turn: { silence: 100 } })
    stt.last().onFinal('três')
    await vi.advanceTimersByTimeAsync(100)
    expect(predict).toHaveBeenCalledTimes(1)
    expect(userTexts(h4b)).toEqual(['um', 'dois', 'três'])
  })

  it('endTurn() sends now, including words not finalized; discardTurn() drops the turn', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT()
    const { h4b, voice: v } = await setup({ stt: stt.provider })
    await v.listen()
    stt.last().onFinal('primeira')
    stt.last().onPartial?.('parte')
    v.endTurn()
    await flush()
    // The late final of the words already sent is not sent again.
    stt.last().onFinal('parte')
    await vi.advanceTimersByTimeAsync(1000)
    expect(userTexts(h4b)).toEqual(['primeira parte'])
    stt.last().onFinal('esquece')
    v.discardTurn()
    await vi.advanceTimersByTimeAsync(2000)
    expect(userTexts(h4b)).toEqual(['primeira parte'])
    expect(v.getState().listening).toBe(true)
  })

  it('stop() sends the pending turn', async () => {
    vi.useFakeTimers()
    const stt = fakeSTT()
    const { h4b, voice: v } = await setup({ stt: stt.provider })
    await v.listen()
    stt.last().onFinal('tchau')
    v.stop()
    await flush()
    expect(userTexts(h4b)).toEqual(['tchau'])
  })
})

describe('speech output and barge-in', () => {
  it('speaks sentence by sentence while the reply streams', async () => {
    const tts = fakeTTS()
    const { h4b } = await setup({ tts: tts.provider, output: 'voice' }, transport(['Olá! Tudo', ' bem? Então', ' vamos']))
    h4b.send('oi')
    await h4b.when('stimulus', ({ stimulus }) => stimulus.type === 'message.delta' && stimulus.delta === ' vamos')
    expect(tts.spoken).toEqual(['Olá!']) // the next sentence waits its turn
    tts.provider.finish()
    await new Promise((r) => setTimeout(r, 0))
    expect(tts.spoken).toEqual(['Olá!', ' Tudo bem?'])
    await h4b.interrupt()
  })

  it('a backchannel over the bot is ignored; real speech interrupts and keeps only what was spoken', async () => {
    const stt = fakeSTT()
    const tts = fakeTTS()
    const { h4b, voice: v, decisions } = await setup(
      { stt: stt.provider, tts: tts.provider, output: 'voice' },
      transport(['Primeira frase. Segunda frase. Terceira']),
    )
    await v.listen()
    h4b.send('conta')
    await h4b.when('stimulus', ({ stimulus }) => stimulus.type === 'message.delta')
    tts.provider.finish() // "Primeira frase." was heard
    await new Promise((r) => setTimeout(r, 0))
    expect(v.getState().phase).toBe('botSpeaking')

    stt.last().onFinal('aham')
    expect(decisions.at(-1)).toMatchObject({ kind: 'ignore', reason: 'backchannel' })
    expect(v.getState().speaking).toBe(true)

    stt.last().onPartial?.('espera')
    expect(v.getState().speaking).toBe(true) // one word in a live transcript: not yet
    stt.last().onPartial?.('espera aí')
    expect(v.getState()).toMatchObject({ speaking: false, interrupted: true })
    await h4b.when('turn.interrupted', () => true)
    const reply = h4b.messages.find((m) => m.role === 'assistant')!
    expect(reply).toMatchObject({ interrupted: true })
    expect(textOf(reply)).toBe('Primeira frase.')
  })

  it('pressing to talk over the bot interrupts it', async () => {
    const stt = fakeSTT()
    const tts = fakeTTS()
    const { h4b, voice: v } = await setup(
      { stt: stt.provider, tts: tts.provider, output: 'voice', mode: 'push-to-talk' },
      transport(['Uma resposta longa. Com várias frases.']),
    )
    h4b.send('conta')
    await h4b.when('stimulus', ({ stimulus }) => stimulus.type === 'message.delta')
    const aborted = h4b.when('turn.status', (s) => s.phase === 'aborted')
    const interrupted = h4b.when('turn.interrupted', () => true)
    await v.listen()
    await aborted
    await interrupted
    expect(h4b.messages.find((m) => m.role === 'assistant')).toBeUndefined() // nothing was heard
    expect(v.getState().interrupted).toBe(true)
  })
})

describe('httpEndOfTurn', () => {
  it('posts the transcript and recent turns, and reads the probability', async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({
        partial: 'eu queria',
        history: [{ role: 'assistant', text: 'Oi' }],
        language: 'pt-BR',
      })
      return new Response(JSON.stringify({ done: false }))
    })
    const provider = httpEndOfTurn({ url: '/eot', fetch: fetch as any })
    const signal = new AbortController().signal
    const input = { partial: 'eu queria', history: [{ role: 'assistant' as const, text: 'Oi' }], language: 'pt-BR' }
    expect(await provider.predict(input, signal)).toBe(0)
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ probability: 0.7 })))
    expect(await provider.predict(input, signal)).toBe(0.7)
    fetch.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    await expect(provider.predict(input, signal)).rejects.toThrow('500')
  })
})
