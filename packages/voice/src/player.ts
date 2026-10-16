import { SpeechError, type AudioPlayer, type Prosody, type ProsodySupport, type SpeechAudio } from './types.js'

export type WebAudioPlayerOptions = {
  /** The audio context to play in. Default: one created on the first `unlock()`. */
  context?: AudioContext | (() => AudioContext)
  /**
   * Where the speech goes. Default `context.destination`. Return your own node
   * to tap the voice (an `AnalyserNode` for mouth movement, a recorder).
   */
  output?: (context: AudioContext) => AudioNode
  /** How long `play` waits for a suspended context to resume before failing. Default 1000 ms. */
  resumeTimeout?: number
}

/** Plays speech through Web Audio, with the effects of each sentence. */
export function webAudioPlayer(options: WebAudioPlayerOptions = {}): AudioPlayer {
  let context: AudioContext | undefined
  let output: AudioNode | undefined
  /** Everything still sounding: the current sentence and the tails of earlier ones. */
  const live = new Set<() => void>()

  const ensure = (): AudioContext => {
    if (!context) {
      const given = options.context
      context = typeof given === 'function' ? given() : (given ?? new AudioContext())
      output = options.output?.(context) ?? context.destination
    }
    return context
  }

  const running = async (ctx: AudioContext) => {
    if (ctx.state === 'running') return true
    const resumed = ctx.resume().then(
      () => true,
      () => false,
    )
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), options.resumeTimeout ?? 1000))
    return (await Promise.race([resumed, timeout])) && (ctx.state as AudioContextState) === 'running'
  }

  return {
    isSupported: () => typeof AudioContext !== 'undefined' || !!options.context,
    unlock() {
      const ctx = ensure()
      if (ctx.state !== 'running') ctx.resume().catch(() => {})
    },
    async play(audio, play) {
      const ctx = ensure()
      if (play.signal?.aborted) return
      if (!(await running(ctx))) {
        throw new SpeechError('not-allowed', 'Audio is blocked until the user interacts with the page (call voice.unlockAudio() in a click)')
      }
      if (play.signal?.aborted) return
      const processed = play.effects?.process?.(audio) ?? audio
      const buffer = ctx.createBuffer(1, Math.max(1, processed.samples.length), processed.sampleRate)
      buffer.getChannelData(0).set(processed.samples)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = play.playbackRate ?? 1
      const chain = play.effects?.connect(ctx, source) ?? { output: source }
      const gain = ctx.createGain()
      gain.gain.value = 10 ** ((play.gainDb ?? 0) / 20)
      chain.output.connect(gain).connect(output!)

      let released = false
      let tailTimer: ReturnType<typeof setTimeout> | undefined
      const release = () => {
        if (released) return
        released = true
        clearTimeout(tailTimer)
        live.delete(release)
        try {
          source.stop()
        } catch {}
        gain.disconnect()
        chain.dispose?.()
      }
      live.add(release)

      await new Promise<void>((resolve) => {
        const done = () => {
          play.signal?.removeEventListener('abort', abort)
          resolve()
        }
        const abort = () => {
          release()
          done()
        }
        source.onended = () => {
          // The speech is over; the effects ring out on their own.
          tailTimer = setTimeout(release, ((chain.tail ?? 0) + 0.1) * 1000)
          done()
        }
        play.signal?.addEventListener('abort', abort, { once: true })
        source.start()
      })
    },
    stop() {
      for (const release of [...live]) release()
    },
  }
}

export type ProsodyPlan = {
  /** What the provider is asked to do itself. */
  synth: Prosody
  /** The player's playback rate. */
  playbackRate: number
  /** The player's gain. */
  gainDb: number
}

/**
 * Splits the prosody between the provider and the player. The provider does
 * what it declares; with a player, pitch becomes a playback rate (which also
 * speeds up the speech, so a provider that controls its rate is asked to slow
 * down by the same factor and the tempo stays) and volume becomes gain. Rate
 * is never faked with the playback rate: it would change the pitch too.
 */
export function planProsody(native: ProsodySupport = {}, prosody: Prosody = {}, player: boolean): ProsodyPlan {
  const synth: Prosody = {}
  let playbackRate = 1
  let gainDb = 0
  if (prosody.pitch) {
    if (native.pitch) synth.pitch = prosody.pitch
    else if (player) playbackRate = 2 ** (prosody.pitch / 12)
  }
  const rate = prosody.rate ?? 1
  if (native.rate && (rate !== 1 || playbackRate !== 1)) synth.rate = rate / playbackRate
  if (prosody.volume) {
    if (native.volume) synth.volume = prosody.volume
    else if (player) gainDb = prosody.volume
  }
  return { synth, playbackRate, gainDb }
}

/** 16-bit PCM WAV file of mono audio. */
export function encodeWav(audio: SpeechAudio): Blob {
  const { samples, sampleRate } = audio
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i]!)) * 0x7fff, true)
  return new Blob([view], { type: 'audio/wav' })
}
