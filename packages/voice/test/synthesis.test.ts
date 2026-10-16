// @vitest-environment jsdom
import { createH4B, type Transport } from '@handsforbots/core'
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
    const { h4b, voice: v } = await setup({ tts: [model.provider, browser.provider], player })
    expect(model.load).not.toHaveBeenCalled()
    expect(v.getState().ttsStatus).toEqual({ model: { state: 'unloaded', total: 1000 }, browser: { state: 'ready' } })

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
