import type { Prosody, SpeechAudio } from '@handsforbots/voice'

/**
 * A parameter, described like a Web Audio Modules 2.0 `WamParameterConfiguration`
 * (`label`, `type`, `defaultValue`, `minValue`, `maxValue`, `discreteStep`,
 * `exponent`, `choices`, `units`), so UIs and validators can be generated.
 * Times are in seconds and levels in decibels, as in the Web Audio API.
 */
export type ParamInfo = {
  label: string
  type?: 'float' | 'int' | 'boolean' | 'choice'
  defaultValue: number
  minValue: number
  maxValue: number
  discreteStep?: number
  /** Skew for sliders: values above 1 give more room to the low end (frequencies). */
  exponent?: number
  choices?: string[]
  units?: string
}

/**
 * One effect in a chain: `type` plus its parameters, flat, named after the
 * Web Audio option dictionaries (`BiquadFilterOptions`: `frequency`, `Q`,
 * `gain`; `DynamicsCompressorOptions`: `threshold`, `knee`, `ratio`,
 * `attack`, `release`; `DelayOptions`: `delayTime`…). Missing parameters take
 * their default.
 */
export type EffectSpec = {
  type: string
  /** Optional name, to address the effect at runtime (`update('voz', …)`). */
  id?: string
  /** Kept in the chain, but not applied. */
  bypass?: boolean
  [param: string]: string | number | boolean | undefined
}

/** A chain of effects, applied in order, plus the prosody asked of the synthesizer. */
export type EffectChain = {
  /** Format version. */
  version: 1
  name?: string
  description?: string
  /** SSML-style prosody: rate multiplier, pitch in semitones, volume in dB. */
  prosody?: Prosody
  effects: EffectSpec[]
}

export type EffectParams = Record<string, number>

/** What `build` returns: the nodes between the previous effect and the next. */
export type EffectNodes = {
  input: AudioNode
  output: AudioNode
  dispose?(): void
}

/** Context handed to the FFmpeg exporter of an effect. */
export type FfmpegContext = { sampleRate: number }

/** An FFmpeg filter for an effect; `approximate` explains what differs from Web Audio. */
export type FfmpegFilter = { filter: string; approximate?: string } | string

/**
 * An effect type. Register your own with `defineEffect` and pass it in
 * `voiceEffects(chain, { effects: [...] })`. Provide `build` (Web Audio
 * nodes), `process` (samples, before playback), or both.
 */
export type EffectDefinition = {
  type: string
  label: string
  description?: string
  params: Record<string, ParamInfo>
  /** Sample-level processing (runs before the Web Audio graph). */
  process?(audio: SpeechAudio, params: EffectParams): SpeechAudio
  /** Web Audio nodes; may change `source.playbackRate`. */
  build?(context: BaseAudioContext, params: EffectParams, source: AudioBufferSourceNode): EffectNodes
  /** Seconds it keeps sounding after the input stops (reverb, echo). */
  tail?(params: EffectParams): number
  /** Playback-rate factor the effect applies (for offline render lengths). */
  speed?(params: EffectParams): number
  /** Equivalent FFmpeg filter, or `undefined` when there is none. */
  ffmpeg?(params: EffectParams, context: FfmpegContext): FfmpegFilter | undefined
}
