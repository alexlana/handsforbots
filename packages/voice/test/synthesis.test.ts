// @vitest-environment jsdom
import { createH4B, textOf, type Transport } from '@handsforbots/core'
import { describe, expect, it, vi } from 'vitest'
import {
  encodeWav,
  planProsody,
  utteranceProsody,
  voice,
  type AudioPlayer,
  type LoadProgress,
  type PlayOptions,
  type SpeechAudio,
  type SpeechEffects,
  type SpeechToText,
  type TextToSpeech,
  type VoiceService,
} from '../src/index.js'

/** A player the test finishes by hand. */
function fakePlayer() {
  const plays: { audio: SpeechAudio; options: PlayOptions; finish(): void }[] = []
  const player: AudioPlayer = {
    isSupported: () => true,
    unlock: vi.fn(),
    play(audio, options) {
      return new Promise((resolve) => {
        plays.push({ audio, options, finish: resolve })
        options.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    },
    stop: vi.fn(),
  }
  return { player, plays }
}

const audioOf = (text: string): SpeechAudio => ({ samples: new Float32Array(text.length), sampleRate: 16000 })

/** A model: `load` resolves when the test says so, `synthesize` right away. */
function fakeModel(name = 'model', options: { failLoad?: boolean; failSynth?: boolean; prosody?: TextToSpeech['prosody'] } = {}) {
  const synthesized: { text: string; prosody?: unknown }[] = []
  let progress: ((p: LoadProgress) => void) | undefined
  let finishLoad: (() => void) | undefined
  let failLoad: ((error: Error) => void) | undefined
  const load = vi.fn((onProgress: (p: LoadProgress) => void) => {
    progress = onProgress
    return new Promise<void>((resolve, reject) => {
      finishLoad = resolve
      failLoad = reject
      if (options.failLoad) reject(new Error('404'))
    })
  })
  const provider: TextToSpeech = {
    name,
    size: 1000,
    prosody: options.prosody,
    isSupported: () => true,
    load,
    async synthesize(text, speakOptions) {
      if (options.failSynth) throw new Error('model choked')
      synthesized.push({ text, prosody: speakOptions.prosody })
      return audioOf(text)
    },
  }
  return {
    provider,
    synthesized,
    load,
    progress: (loaded: number, total?: number) => progress?.({ loaded, total }),
    finishLoad: () => finishLoad?.(),
    failLoad: (error = new Error('boom')) => failLoad?.(error),
  }
}

/** A provider that speaks by itself (like the browser's voice). */
function fakeSpeaker(name = 'browser') {
  const spoken: string[] = []
  const finishers: (() => void)[] = []
  const provider: TextToSpeech = {
    name,
    isSupported: () => true,
    speak(text, options) {
      spoken.push(text)
      return new Promise((resolve) => {
        finishers.push(resolve)
        options.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    },
    cancel: vi.fn(),
  }
  return { provider, spoken, finishAll: () => finishers.splice(0).forEach((f) => f()) }
}

const transport = (reply: string): Transport => ({
  name: 'reply',
  async *run(request) {
    yield { type: 'message.start', messageId: `m-${request.turnId}` }
    yield { type: 'message.delta', messageId: `m-${request.turnId}`, delta: reply }
    yield { type: 'message.end', messageId: `m-${request.turnId}` }
  },
})

async function setup(options: Parameters<typeof voice>[0], reply = 'Olá.') {
  const h4b = createH4B({ plugins: [voice({ language: 'pt-BR', output: 'voice', ...options })] })
  h4b.provide('transport', transport(reply))
  await h4b.start()
  return { h4b, voice: h4b.get('voice') as VoiceService }
}

const eventually = async (check: () => void, timeout = 1000) => {
  const start = Date.now()
  for (;;) {
    try {
      return check()
    } catch (error) {
      if (Date.now() - start > timeout) throw error
      await new Promise((r) => setTimeout(r, 5))
    }
  }
}

describe('prosody', () => {
  it('splits it between the provider and the player', () => {
    // The provider does all of it.
    expect(planProsody({ rate: true, pitch: true, volume: true }, { rate: 1.2, pitch: 2, volume: -3 }, true)).toEqual({
      synth: { rate: 1.2, pitch: 2, volume: -3 },
      playbackRate: 1,
      gainDb: 0,
    })
    // Pitch through the playback rate; the model slows down by the same factor so the tempo stays.
    const plan = planProsody({ rate: true }, { pitch: 12 }, true)
    expect(plan).toEqual({ synth: { rate: 0.5 }, playbackRate: 2, gainDb: 0 })
    // Without native rate the rate is not faked, and volume becomes gain.
    expect(planProsody({}, { rate: 1.5, volume: 6 }, true)).toEqual({ synth: {}, playbackRate: 1, gainDb: 6 })
    // No player (the browser's voice without the pitch support): nothing to do.
    expect(planProsody({}, { pitch: 3 }, false)).toEqual({ synth: {}, playbackRate: 1, gainDb: 0 })
  })

  it('maps to utterance values for the browser voice', () => {
    expect(utteranceProsody({}, { rate: 1.2, pitch: 12, volume: -6 })).toEqual({
      rate: 1.2,
      pitch: 2,
      volume: 10 ** (-6 / 20),
    })
    expect(utteranceProsody({ rate: 2 }, { volume: 6 })).toMatchObject({ rate: 2, volume: 1 })
  })

  it('reaches the provider and the player from the effects', async () => {
    const model = fakeModel('model', { prosody: { rate: true } })
    const { player, plays } = fakePlayer()
    const effects: SpeechEffects = {
      name: 'fx',
      prosody: () => ({ rate: 1.1, pitch: 12, volume: -6 }),
      connect: (_context, source) => ({ output: source }),
    }
    const { h4b, voice: v } = await setup({ tts: model.provider, player, effects, load: { start: 'eager' } })
    model.finishLoad()
    await eventually(() => expect(v.getState().ttsStatus.model?.state).toBe('ready'))
    h4b.send('oi')
    await eventually(() => expect(plays).toHaveLength(1))
    expect(model.synthesized[0]).toEqual({ text: 'Olá.', prosody: { rate: 0.55 } })
    expect(plays[0]!.options).toMatchObject({ effects, playbackRate: 2, gainDb: -6 })
    expect(v.getState().effects).toBe('fx')
    v.setEffects(null)
    expect(v.getState().effects).toBeUndefined()
  })

  it('follows the name of effects that change', async () => {
    const listeners = new Set<() => void>()
    const effects = {
      name: 'clean',
      connect: (_context: BaseAudioContext, source: AudioBufferSourceNode) => ({ output: source }),
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const { h4b, voice: v } = await setup({ tts: fakeModel().provider, player: fakePlayer().player, effects })
    effects.name = 'radio'
    for (const listener of listeners) listener()
    expect(v.getState().effects).toBe('radio')
    v.setEffects(null)
    expect(listeners.size).toBe(0)
    v.setEffects(effects)
    await h4b.stop()
    expect(listeners.size).toBe(0)
  })
})

describe('models: when they load and who speaks meanwhile', () => {
  it('first-use + fallback: the browser voice speaks while the model downloads, the model after', async () => {
    const model = fakeModel()
    const browser = fakeSpeaker()
    const { player, plays } = fakePlayer()
    // `output: 'voice'` (from setup): speech is how this app answers, so the download starts on mount.
    const { h4b, voice: v } = await setup({ tts: [model.provider, browser.provider], player })
    expect(model.load).toHaveBeenCalledTimes(1)
    expect(v.getState().ttsStatus).toEqual({ model: { state: 'loading', loaded: 0, total: 1000 }, browser: { state: 'ready' } })

    h4b.send('oi')
    await eventually(() => expect(browser.spoken).toEqual(['Olá.']))
    expect(model.load).toHaveBeenCalledTimes(1)
    expect(v.getState().ttsStatus.model?.state).toBe('loading')
    browser.finishAll()

    model.finishLoad()
    await eventually(() => expect(v.getState().ttsStatus.model?.state).toBe('ready'))
    h4b.send('de novo')
    await eventually(() => expect(plays).toHaveLength(1))
    expect(browser.spoken).toHaveLength(1)
    expect(v.getState().tts).toBe('model')
  })

  it('silent: replies are not spoken until the model is ready, and the text stays', async () => {
    const model = fakeModel()
    const browser = fakeSpeaker()
    const { player, plays } = fakePlayer()
    const { h4b } = await setup({ tts: [model.provider, browser.provider], player, load: { whileLoading: 'silent' } })
    await h4b.ask('oi')
    expect(browser.spoken).toEqual([])
    expect(plays).toEqual([])
    expect(h4b.messages.at(-1)).toMatchObject({ role: 'assistant' })
  })

  it('wait: speech waits for the download in progress', async () => {
    const model = fakeModel()
    const { player, plays } = fakePlayer()
    const { h4b } = await setup({ tts: model.provider, player, load: { whileLoading: 'wait' } })
    await h4b.ask('oi')
    expect(model.load).toHaveBeenCalled()
    expect(plays).toEqual([])
    model.finishLoad()
    await eventually(() => expect(plays).toHaveLength(1))
  })

  it('manual: nothing downloads until loadSpeech(), which reports progress', async () => {
    const model = fakeModel()
    const browser = fakeSpeaker()
    const { player } = fakePlayer()
    const { h4b, voice: v } = await setup({ tts: [model.provider, browser.provider], player, load: { start: 'manual' } })
    await h4b.ask('oi')
    await eventually(() => expect(browser.spoken).toEqual(['Olá.']))
    expect(model.load).not.toHaveBeenCalled()

    const loaded = v.loadSpeech()
    await new Promise((r) => setTimeout(r, 120))
    model.progress(500, 1000)
    expect(v.getState().ttsStatus.model).toEqual({ state: 'loading', loaded: 500, total: 1000 })
    model.finishLoad()
    expect(await loaded).toBe(true)
    expect(v.getState().ttsStatus.model).toMatchObject({ state: 'ready' })
  })

  it("first-use: the microphone alone downloads nothing; turning the bot's voice on does", async () => {
    const stt: SpeechToText = { name: 'mic', capabilities: {}, isSupported: () => true, listen: () => ({ stop() {}, abort() {} }) }
    const model = fakeModel()
    const { player } = fakePlayer()
    const h4b = createH4B({ plugins: [voice({ stt, tts: model.provider, player, output: 'text' })] })
    await h4b.start()
    const v = h4b.get('voice') as VoiceService
    await v.listen()
    expect(model.load).not.toHaveBeenCalled()
    // The widget's speaker button turns the bot's voice on with `auto`.
    v.setOutput('auto')
    expect(model.load).toHaveBeenCalledTimes(1)
    expect(v.getState().ttsStatus.model?.state).toBe('loading')
  })

  it("first-use: downloads on mount when the app answers with voice (output: 'voice')", async () => {
    const model = fakeModel()
    const { player } = fakePlayer()
    const h4b = createH4B({ plugins: [voice({ tts: model.provider, player, output: 'voice' })] })
    await h4b.start()
    expect(model.load).toHaveBeenCalledTimes(1)
  })

  it("first-use: the default output ('auto') downloads nothing on mount", async () => {
    const model = fakeModel()
    const { player } = fakePlayer()
    const h4b = createH4B({ plugins: [voice({ tts: model.provider, player })] })
    await h4b.start()
    expect(model.load).not.toHaveBeenCalled()
  })

  it('manual: turning voice on downloads nothing', async () => {
    const stt: SpeechToText = { name: 'mic', capabilities: {}, isSupported: () => true, listen: () => ({ stop() {}, abort() {} }) }
    const model = fakeModel()
    const { player } = fakePlayer()
    const h4b = createH4B({ plugins: [voice({ stt, tts: model.provider, player, load: { start: 'manual' } })] })
    await h4b.start()
    const v = h4b.get('voice') as VoiceService
    await v.listen()
    v.setOutput('voice')
    expect(model.load).not.toHaveBeenCalled()
  })

  it('eager: a failed model moves the download on to the next one', async () => {
    const broken = fakeModel('broken', { failLoad: true })
    const second = fakeModel('second')
    const errors: unknown[] = []
    const { player } = fakePlayer()
    const h4b = createH4B({ plugins: [voice({ tts: [broken.provider, second.provider], player, load: { start: 'eager' } })] })
    h4b.on('error', (e) => errors.push(e))
    await h4b.start()
    const v = h4b.get('voice') as VoiceService
    await eventually(() => expect(second.load).toHaveBeenCalled())
    expect(v.getState().ttsStatus.broken).toEqual({ state: 'failed', error: '404' })
    expect(errors).toEqual([expect.objectContaining({ source: 'voice:tts:broken' })])
  })

  it('a sentence the model fails to synthesize goes to the next ready provider', async () => {
    const model = fakeModel('model', { failSynth: true })
    const browser = fakeSpeaker()
    const { player } = fakePlayer()
    const { h4b, voice: v } = await setup({ tts: [model.provider, browser.provider], player, load: { start: 'eager' } })
    model.finishLoad()
    await eventually(() => expect(v.getState().ttsStatus.model?.state).toBe('ready'))
    await h4b.ask('oi')
    await eventually(() => expect(browser.spoken).toEqual(['Olá.']))
  })
})

describe('synthesized speech', () => {
  it('synthesizes the next sentence while the current one plays', async () => {
    const model = fakeModel()
    const { player, plays } = fakePlayer()
    const { h4b, voice: v } = await setup(
      { tts: model.provider, player, load: { start: 'eager' } },
      'Primeira frase. Segunda frase.',
    )
    model.finishLoad()
    await eventually(() => expect(v.getState().ttsStatus.model?.state).toBe('ready'))
    h4b.send('conta')
    await eventually(() => expect(plays).toHaveLength(1))
    await eventually(() => expect(model.synthesized.map((s) => s.text)).toEqual(['Primeira frase.', ' Segunda frase.']))
    expect(plays).toHaveLength(1)
    expect(v.getState().speaking).toBe(true)
    plays[0]!.finish()
    await eventually(() => expect(plays).toHaveLength(2))
    plays[1]!.finish()
    await eventually(() => expect(v.getState().speaking).toBe(false))
  })

  it('cancelSpeech stops the player; setTTS swaps the providers', async () => {
    const model = fakeModel()
    const browser = fakeSpeaker()
    const { player, plays } = fakePlayer()
    const { h4b, voice: v } = await setup({ tts: model.provider, player, load: { start: 'eager' } })
    model.finishLoad()
    await eventually(() => expect(v.getState().ttsStatus.model?.state).toBe('ready'))
    h4b.send('oi')
    await eventually(() => expect(plays).toHaveLength(1))
    v.cancelSpeech()
    expect(player.stop).toHaveBeenCalled()
    expect(v.getState().speaking).toBe(false)

    await v.setTTS(browser.provider)
    expect(v.getState()).toMatchObject({ tts: 'browser', ttsStatus: { browser: { state: 'ready' } } })
    await h4b.ask('de novo')
    await eventually(() => expect(browser.spoken).toEqual(['Olá.']))
  })

  it('unlocks the audio on a user gesture when a provider synthesizes', async () => {
    const model = fakeModel()
    const { player } = fakePlayer()
    const { h4b } = await setup({ tts: model.provider, player })
    document.dispatchEvent(new Event('pointerdown'))
    expect(player.unlock).toHaveBeenCalledTimes(1)
    await h4b.stop()
    document.dispatchEvent(new Event('pointerdown'))
    expect(player.unlock).toHaveBeenCalledTimes(1)
  })
})

describe('encodeWav', () => {
  it('writes a 16-bit mono WAV', async () => {
    const blob = encodeWav({ samples: new Float32Array([0, 1, -1]), sampleRate: 24000 })
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.readAsArrayBuffer(blob)
    })
    const view = new DataView(bytes)
    expect(blob.size).toBe(44 + 6)
    expect(view.getUint32(24, true)).toBe(24000)
    expect(view.getInt16(46, true)).toBe(0x7fff)
  })
})

describe('debugging speech (voice.tts)', () => {
  const traced = (h4b: ReturnType<typeof createH4B>) => {
    const events: Record<string, unknown>[] = []
    ;(h4b.on as unknown as (e: string, l: (p: Record<string, unknown>) => void) => void)('voice.tts', (e) => events.push(e))
    return events
  }

  it('reports the model loading: start, each quarter, done', async () => {
    const model = fakeModel()
    const { player } = fakePlayer()
    const h4b = createH4B({ plugins: [voice({ tts: model.provider, player, load: { start: 'manual' } })] })
    const events = traced(h4b)
    await h4b.start()
    const v = h4b.get('voice') as VoiceService
    const loaded = v.loadSpeech()
    for (const loaded of [100, 300, 400, 600, 999]) model.progress(loaded, 1000)
    model.finishLoad()
    await loaded
    expect(events.map((e) => [e.event, e.loaded])).toEqual([
      ['load.start', undefined],
      ['load.progress', 300],
      ['load.progress', 600],
      ['load.progress', 999],
      ['load.done', undefined],
    ])
    expect(events[0]).toMatchObject({ provider: 'model', size: 1000 })
  })

  it('reports a failed load with its message', async () => {
    const broken = fakeModel('broken', { failLoad: true })
    const { player } = fakePlayer()
    const h4b = createH4B({ plugins: [voice({ tts: broken.provider, player, load: { start: 'eager' } })] })
    const events = traced(h4b)
    await h4b.start()
    await eventually(() => expect(events.at(-1)).toMatchObject({ event: 'load.error', provider: 'broken', message: '404' }))
  })

  it('says what happens to a chunk asked for while the model downloads', async () => {
    const model = fakeModel()
    const browser = fakeSpeaker()
    const { player } = fakePlayer()
    const h4b = createH4B({ plugins: [voice({ language: 'pt-BR', output: 'voice', tts: [model.provider, browser.provider], player })] })
    h4b.provide('transport', transport('Olá.'))
    const events = traced(h4b)
    await h4b.start()
    await h4b.ask('oi')
    await eventually(() =>
      expect(events.find((e) => e.event === 'speech.while-loading')).toMatchObject({
        provider: 'model',
        policy: 'fallback',
        action: 'fallback',
        to: 'browser',
        state: 'loading',
      }),
    )
  })

  it('says when nobody speaks while the model downloads', async () => {
    const model = fakeModel()
    const { player } = fakePlayer()
    const h4b = createH4B({
      plugins: [voice({ language: 'pt-BR', output: 'voice', tts: model.provider, player, load: { whileLoading: 'silent' } })],
    })
    h4b.provide('transport', transport('Olá.'))
    const events = traced(h4b)
    await h4b.start()
    await h4b.ask('oi')
    await eventually(() => expect(events.find((e) => e.event === 'speech.while-loading')).toMatchObject({ policy: 'silent', action: 'silent' }))
  })

  it('says which reply and which part of its text each chunk is, and whether a reply will be spoken', async () => {
    const speaker = fakeSpeaker()
    const { h4b, voice: v } = await setup({ tts: speaker.provider }, 'Olá. Tudo bem?')
    const speech: Record<string, unknown>[] = []
    const tracks: unknown[] = []
    h4b.on('voice.speech', (e) => speech.push(e as Record<string, unknown>))
    h4b.on('voice.track', (e) => tracks.push(e))
    expect(v.willSpeakReplies()).toBe(true)
    void h4b.ask('oi')
    await eventually(() => expect(speaker.spoken).toHaveLength(1))
    const reply = h4b.messages.find((m) => m.role === 'assistant')!
    const text = textOf(reply)
    expect(tracks).toEqual([{ messageId: reply.id, speak: true }])
    expect(speech[0]).toMatchObject({ phase: 'start', messageId: reply.id, from: 0 })
    expect(text.slice(speech[0]!.from as number, speech[0]!.to as number)).toBe(speaker.spoken[0])
    speaker.finishAll()
    await eventually(() => expect(speaker.spoken).toHaveLength(2))
    const second = speech.filter((e) => e.phase === 'start')[1]!
    expect(second).toMatchObject({ messageId: reply.id, from: speech[0]!.to, to: text.length })
    v.cancelSpeech()
    v.setOutput('text')
    expect(v.willSpeakReplies()).toBe(false)
    await h4b.ask('de novo')
    expect(tracks.at(-1)).toMatchObject({ speak: false })
  })

  it('reports a reply chunk that was cancelled before it was spoken', async () => {
    const speaker = fakeSpeaker()
    const { h4b, voice: v } = await setup({ tts: speaker.provider }, 'Um. Dois. Três.')
    const skipped: Record<string, unknown>[] = []
    h4b.on('voice.speech', (e) => e.phase === 'skip' && skipped.push(e as Record<string, unknown>))
    void h4b.ask('oi')
    await eventually(() => expect(speaker.spoken).toHaveLength(1))
    v.cancelSpeech()
    await eventually(() => expect(skipped.length).toBeGreaterThan(0))
    expect(skipped[0]).toMatchObject({ reason: 'cancelled', messageId: expect.any(String) })
  })

  it('reports the last synthesis failure once, under the provider name', async () => {
    const model = fakeModel('piper', { failSynth: true })
    const { player } = fakePlayer()
    const { h4b, voice: v } = await setup({ tts: model.provider, player, load: { start: 'eager' } })
    const errors: { source: string }[] = []
    const speech: Record<string, unknown>[] = []
    h4b.on('error', (e) => errors.push(e as { source: string }))
    h4b.on('voice.speech', (e) => speech.push(e as Record<string, unknown>))
    model.finishLoad()
    await eventually(() => expect(v.getState().ttsStatus.piper?.state).toBe('ready'))
    await h4b.ask('oi')
    // The chunk is over once the voice.speech error is out; every error comes before it.
    await eventually(() => expect(speech).toHaveLength(1))
    await eventually(() => expect(v.getState().speaking).toBe(false))
    expect(errors).toEqual([expect.objectContaining({ source: 'voice:tts:piper' })])
    expect(speech).toEqual([expect.objectContaining({ phase: 'error', provider: 'piper', message: 'model choked' })])
  })

  it("forwards the provider's own trace and stops on setTTS", async () => {
    let listener: ((e: { event: string; [k: string]: string | number | boolean | undefined }) => void) | undefined
    const off = vi.fn()
    const model = fakeModel('piper')
    model.provider.trace = (l) => ((listener = l), off)
    const { player } = fakePlayer()
    const h4b = createH4B({ plugins: [voice({ tts: model.provider, player, load: { start: 'manual' } })] })
    const events = traced(h4b)
    await h4b.start()
    listener!({ event: 'worker.created', worker: 1, ignored: undefined })
    expect(events).toEqual([{ event: 'worker.created', worker: 1, provider: 'piper' }])
    await (h4b.get('voice') as VoiceService).setTTS(fakeSpeaker().provider)
    expect(off).toHaveBeenCalled()
  })
})
