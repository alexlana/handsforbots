import type { SpeechAudio } from '@handsforbots/voice'
import type { EffectDefinition, EffectNodes, EffectParams, FfmpegFilter, ParamInfo } from './types.js'

/** Registers an effect type (returns it unchanged, typed). */
export const defineEffect = (definition: EffectDefinition): EffectDefinition => definition

const fromDb = (db: number) => 10 ** (db / 20)
const round = (value: number, digits = 4) => Number(value.toFixed(digits))
const ms = (seconds: number) => round(seconds * 1000, 2)
const v = (params: EffectParams, key: string) => params[key] ?? 0

const frequency = (defaultValue: number, minValue = 20, maxValue = 20000): ParamInfo => ({
  label: 'Frequency',
  defaultValue,
  minValue,
  maxValue,
  exponent: 3,
  units: 'Hz',
})
const mix = (defaultValue: number): ParamInfo => ({ label: 'Mix', defaultValue, minValue: 0, maxValue: 1 })
const lfoRate = (defaultValue: number): ParamInfo => ({ label: 'Rate', defaultValue, minValue: 0.1, maxValue: 20, exponent: 2, units: 'Hz' })

/** Oscillators started by a build, stopped by its dispose. */
function oscillators(context: BaseAudioContext) {
  const started: OscillatorNode[] = []
  return {
    lfo(hz: number) {
      const osc = context.createOscillator()
      osc.frequency.value = hz
      osc.start()
      started.push(osc)
      return osc
    },
    dispose() {
      for (const osc of started.splice(0)) {
        try {
          osc.stop()
        } catch {}
        osc.disconnect()
      }
    },
  }
}

/** Dry and wet paths summed: `wire(input, output)` adds the wet path. */
function parallel(context: BaseAudioContext, dryGain: number) {
  const input = context.createGain()
  const output = context.createGain()
  const dry = context.createGain()
  dry.gain.value = dryGain
  input.connect(dry).connect(output)
  return { input, output }
}

/* -------------------------------------------------------------------------- */
/* Filters (BiquadFilterNode)                                                 */
/* -------------------------------------------------------------------------- */

// Web Audio reads Q in dB for lowpass and highpass (resonance) and as a plain factor for the others.
const resonance: ParamInfo = { label: 'Q', defaultValue: 1, minValue: -20, maxValue: 30, units: 'dB' }
const bandwidth = (defaultValue = 1): ParamInfo => ({ label: 'Q', defaultValue, minValue: 0.1, maxValue: 30, exponent: 2 })
const filterGain: ParamInfo = { label: 'Gain', defaultValue: 0, minValue: -40, maxValue: 40, units: 'dB' }

function biquad(
  type: BiquadFilterType,
  label: string,
  description: string,
  params: Record<string, ParamInfo>,
  ffmpeg: (p: EffectParams) => string,
): EffectDefinition {
  return defineEffect({
    type,
    label,
    description,
    params,
    build(context, p) {
      const filter = context.createBiquadFilter()
      filter.type = type
      filter.frequency.value = v(p, 'frequency')
      if ('Q' in params) filter.Q.value = v(p, 'Q')
      if ('gain' in params) filter.gain.value = v(p, 'gain')
      return { input: filter, output: filter }
    },
    ffmpeg,
  })
}

const linearQ = (p: EffectParams) => round(fromDb(v(p, 'Q')))
const filters: EffectDefinition[] = [
  biquad('highpass', 'High-pass', 'Removes the lows below the frequency', { frequency: frequency(100), Q: resonance }, (p) =>
    `highpass=f=${v(p, 'frequency')}:t=q:w=${linearQ(p)}`,
  ),
  biquad('lowpass', 'Low-pass', 'Removes the highs above the frequency (muffled, underwater)', { frequency: frequency(4000), Q: resonance }, (p) =>
    `lowpass=f=${v(p, 'frequency')}:t=q:w=${linearQ(p)}`,
  ),
  biquad('bandpass', 'Band-pass', 'Keeps a band around the frequency (telephone, radio)', { frequency: frequency(1000), Q: bandwidth() }, (p) =>
    `bandpass=f=${v(p, 'frequency')}:t=q:w=${v(p, 'Q')}`,
  ),
  biquad('peaking', 'Peak EQ', 'Boosts or cuts a band', { frequency: frequency(1500), Q: bandwidth(), gain: filterGain }, (p) =>
    `equalizer=f=${v(p, 'frequency')}:t=q:w=${v(p, 'Q')}:g=${v(p, 'gain')}`,
  ),
  biquad('lowshelf', 'Low shelf', 'Boosts or cuts everything below the frequency', { frequency: frequency(200), gain: filterGain }, (p) =>
    `lowshelf=f=${v(p, 'frequency')}:t=s:w=1:g=${v(p, 'gain')}`,
  ),
  biquad('highshelf', 'High shelf', 'Boosts or cuts everything above the frequency', { frequency: frequency(4000), gain: filterGain }, (p) =>
    `highshelf=f=${v(p, 'frequency')}:t=s:w=1:g=${v(p, 'gain')}`,
  ),
  biquad('notch', 'Notch', 'Removes a narrow band (a hum)', { frequency: frequency(1000), Q: bandwidth(1) }, (p) =>
    `bandreject=f=${v(p, 'frequency')}:t=q:w=${v(p, 'Q')}`,
  ),
  biquad('allpass', 'All-pass', 'Shifts the phase around the frequency; alone it sounds the same', { frequency: frequency(1000), Q: bandwidth(1) }, (p) =>
    `allpass=f=${v(p, 'frequency')}:t=q:w=${v(p, 'Q')}`,
  ),
]

/* -------------------------------------------------------------------------- */
/* Dynamics                                                                   */
/* -------------------------------------------------------------------------- */

const gain = defineEffect({
  type: 'gain',
  label: 'Gain',
  description: 'Louder or quieter',
  params: { gain: { label: 'Gain', defaultValue: 0, minValue: -40, maxValue: 24, units: 'dB' } },
  build(context, p) {
    const node = context.createGain()
    node.gain.value = fromDb(v(p, 'gain'))
    return { input: node, output: node }
  },
  ffmpeg: (p) => `volume=${v(p, 'gain')}dB`,
})

const compressorParams: Record<string, ParamInfo> = {
  threshold: { label: 'Threshold', defaultValue: -24, minValue: -100, maxValue: 0, units: 'dB' },
  knee: { label: 'Knee', defaultValue: 30, minValue: 0, maxValue: 40, units: 'dB' },
  ratio: { label: 'Ratio', defaultValue: 12, minValue: 1, maxValue: 20 },
  attack: { label: 'Attack', defaultValue: 0.003, minValue: 0, maxValue: 1, exponent: 3, units: 's' },
  release: { label: 'Release', defaultValue: 0.25, minValue: 0, maxValue: 1, exponent: 2, units: 's' },
}

const compressor = defineEffect({
  type: 'compressor',
  label: 'Compressor',
  description: 'Evens out the loudness (DynamicsCompressorNode)',
  params: compressorParams,
  build(context, p) {
    const node = context.createDynamicsCompressor()
    node.threshold.value = v(p, 'threshold')
    node.knee.value = v(p, 'knee')
    node.ratio.value = v(p, 'ratio')
    node.attack.value = v(p, 'attack')
    node.release.value = v(p, 'release')
    return { input: node, output: node }
  },
  ffmpeg: (p) => ({
    filter: `acompressor=threshold=${round(Math.max(fromDb(v(p, 'threshold')), 0.000976563), 6)}:ratio=${v(p, 'ratio')}:attack=${Math.max(0.01, ms(v(p, 'attack')))}:release=${Math.max(0.01, ms(v(p, 'release')))}:knee=${round(1 + (v(p, 'knee') / 40) * 7, 2)}`,
    approximate: 'acompressor has its own level detector and a 1–8 knee; the knee is mapped linearly',
  }),
})

const limiter = defineEffect({
  type: 'limiter',
  label: 'Limiter',
  description: 'Keeps the peaks under the threshold, so effects added together do not clip',
  params: {
    threshold: { label: 'Threshold', defaultValue: -2, minValue: -24, maxValue: 0, units: 'dB' },
    release: { label: 'Release', defaultValue: 0.15, minValue: 0.01, maxValue: 1, exponent: 2, units: 's' },
    output: { label: 'Output', defaultValue: -2, minValue: -24, maxValue: 6, units: 'dB' },
  },
  build(context, p) {
    const node = context.createDynamicsCompressor()
    node.threshold.value = v(p, 'threshold')
    node.knee.value = 0
    node.ratio.value = 20
    node.attack.value = 0.003
    node.release.value = v(p, 'release')
    const trim = context.createGain()
    trim.gain.value = fromDb(v(p, 'output'))
    node.connect(trim)
    return { input: node, output: trim }
  },
  ffmpeg: (p) => ({
    filter: `alimiter=limit=${round(Math.max(fromDb(v(p, 'threshold')), 0.0625))}:attack=3:release=${ms(v(p, 'release'))},volume=${v(p, 'output')}dB`,
    approximate: 'alimiter looks ahead; the Web Audio limiter is a compressor with ratio 20',
  }),
})

/**
 * Downward expander on the samples: lowers what stays under the threshold
 * (the hiss of a quantized model in the pauses) without touching speech.
 */
function gateSamples(audio: SpeechAudio, p: EffectParams): SpeechAudio {
  const { samples, sampleRate } = audio
  const out = new Float32Array(samples.length)
  const win = Math.max(1, Math.round(sampleRate * 0.01))
  const attack = Math.exp(-1 / (sampleRate * 0.004))
  const hold = Math.exp(-1 / (sampleRate * 0.02))
  const close = Math.exp(-1 / (sampleRate * 0.015))
  const floor = fromDb(-v(p, 'reduction'))
  const open = fromDb(v(p, 'threshold'))
  const knee = fromDb(v(p, 'threshold') - 8)
  let squares = 0
  let envelope = 0
  let g = 1
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!
    squares += s * s
    if (i >= win) squares -= samples[i - win]! * samples[i - win]!
    const rms = Math.sqrt(Math.max(squares, 0) / win)
    envelope = rms > envelope ? rms : rms + (envelope - rms) * hold
    const target = envelope >= open ? 1 : envelope <= knee ? floor : floor + (1 - floor) * ((envelope - knee) / (open - knee))
    g = target + (g - target) * (target > g ? attack : close)
    out[i] = s * g
  }
  return { samples: out, sampleRate }
}

const gate = defineEffect({
  type: 'gate',
  label: 'Noise gate',
  description: 'Lowers the hiss in the pauses (runs on the samples, before the other effects)',
  params: {
    threshold: { label: 'Threshold', defaultValue: -40, minValue: -80, maxValue: -10, units: 'dB' },
    reduction: { label: 'Reduction', defaultValue: 30, minValue: 0, maxValue: 80, units: 'dB' },
  },
  process: gateSamples,
  ffmpeg: (p) => ({
    filter: `agate=threshold=${round(fromDb(v(p, 'threshold')), 6)}:range=${round(Math.max(fromDb(-v(p, 'reduction')), 0), 6)}:ratio=9000:attack=4:release=20`,
    approximate: 'agate follows the level with its own detector',
  }),
})

/* -------------------------------------------------------------------------- */
/* Time and pitch                                                             */
/* -------------------------------------------------------------------------- */

const varispeed = defineEffect({
  type: 'varispeed',
  label: 'Varispeed',
  description: 'Tape speed: pitch and tempo together (above 1 = higher and faster)',
  params: { rate: { label: 'Rate', defaultValue: 1, minValue: 0.5, maxValue: 2 } },
  build(context, p, source) {
    source.playbackRate.value *= v(p, 'rate')
    const through = context.createGain()
    return { input: through, output: through }
  },
  speed: (p) => v(p, 'rate'),
  ffmpeg: (p, { sampleRate }) => `asetrate=${Math.round(sampleRate * v(p, 'rate'))},aresample=${sampleRate}`,
})

const vibrato = defineEffect({
  type: 'vibrato',
  label: 'Vibrato',
  description: 'The pitch wobbles (a delay modulated by an oscillator)',
  params: { rate: lfoRate(5), depth: { label: 'Depth', defaultValue: 0.0025, minValue: 0, maxValue: 0.005, units: 's' } },
  build(context, p) {
    const lfos = oscillators(context)
    const delay = context.createDelay(0.05)
    delay.delayTime.value = 0.005
    const depth = context.createGain()
    depth.gain.value = v(p, 'depth')
    lfos.lfo(v(p, 'rate')).connect(depth).connect(delay.delayTime)
    return { input: delay, output: delay, dispose: lfos.dispose }
  },
  ffmpeg: (p) => ({
    filter: `vibrato=f=${v(p, 'rate')}:d=${round(Math.min(1, v(p, 'depth') / 0.005), 3)}`,
    approximate: 'vibrato takes a 0–1 depth; 5 ms is mapped to 1',
  }),
})

const tremolo = defineEffect({
  type: 'tremolo',
  label: 'Tremolo',
  description: 'The volume wobbles',
  params: { rate: lfoRate(5), depth: { label: 'Depth', defaultValue: 0.6, minValue: 0, maxValue: 1 } },
  build(context, p) {
    const lfos = oscillators(context)
    const node = context.createGain()
    node.gain.value = 1 - v(p, 'depth') / 2
    const amount = context.createGain()
    amount.gain.value = v(p, 'depth') / 2
    lfos.lfo(v(p, 'rate')).connect(amount).connect(node.gain)
    return { input: node, output: node, dispose: lfos.dispose }
  },
  ffmpeg: (p) => `tremolo=f=${v(p, 'rate')}:d=${v(p, 'depth')}`,
})

const CHORUS_VOICES: [delay: number, rate: number][] = [
  [0.02, 1.2],
  [0.032, 1.7],
]

const chorus = defineEffect({
  type: 'chorus',
  label: 'Chorus',
  description: 'Two slightly detuned copies over the voice (watery, many voices)',
  params: { depth: { label: 'Depth', defaultValue: 0.004, minValue: 0, maxValue: 0.008, units: 's' }, mix: mix(0.5) },
  build(context, p) {
    const lfos = oscillators(context)
    const { input, output } = parallel(context, 1)
    for (const [base, rate] of CHORUS_VOICES) {
      const delay = context.createDelay(0.1)
      delay.delayTime.value = base
      const depth = context.createGain()
      depth.gain.value = v(p, 'depth')
      lfos.lfo(rate).connect(depth).connect(delay.delayTime)
      const wet = context.createGain()
      wet.gain.value = v(p, 'mix')
      input.connect(delay).connect(wet).connect(output)
    }
    return { input, output, dispose: lfos.dispose }
  },
  ffmpeg: (p) => {
    const delays = CHORUS_VOICES.map(([d]) => ms(d)).join('|')
    const decays = CHORUS_VOICES.map(() => v(p, 'mix')).join('|')
    const speeds = CHORUS_VOICES.map(([, r]) => r).join('|')
    const depths = CHORUS_VOICES.map(() => ms(v(p, 'depth'))).join('|')
    return { filter: `chorus=1:1:${delays}:${decays}:${speeds}:${depths}`, approximate: 'chorus modulates with its own waveform' }
  },
})

/** Seconds a feedback loop takes to fall 60 dB. */
const ringOut = (delayTime: number, feedback: number) =>
  feedback <= 0 ? delayTime : Math.min(10, delayTime * (Math.log(0.001) / Math.log(Math.min(feedback, 0.99))))

/** Echo taps for FFmpeg's `aecho`, which has no feedback: the repeats are listed. */
function echoTaps(delayTime: number, feedback: number, wet: number, count = 5) {
  const delays: number[] = []
  const decays: number[] = []
  for (let i = 1; i <= count; i++) {
    const level = wet * feedback ** (i - 1)
    if (level < 0.01) break
    delays.push(ms(delayTime * i))
    decays.push(round(level, 3))
  }
  return delays.length ? `aecho=1:1:${delays.join('|')}:${decays.join('|')}` : 'anull'
}

const delay = defineEffect({
  type: 'delay',
  label: 'Echo',
  description: 'Repeats of the voice (DelayNode with feedback)',
  params: {
    delayTime: { label: 'Time', defaultValue: 0.25, minValue: 0.01, maxValue: 2, exponent: 2, units: 's' },
    feedback: { label: 'Feedback', defaultValue: 0.35, minValue: 0, maxValue: 0.9 },
    mix: mix(0.4),
  },
  build(context, p) {
    const { input, output } = parallel(context, 1)
    const node = context.createDelay(2)
    node.delayTime.value = v(p, 'delayTime')
    const feedback = context.createGain()
    feedback.gain.value = v(p, 'feedback')
    const wet = context.createGain()
    wet.gain.value = v(p, 'mix')
    input.connect(node)
    node.connect(feedback).connect(node)
    node.connect(wet).connect(output)
    return { input, output }
  },
  tail: (p) => ringOut(v(p, 'delayTime'), v(p, 'feedback')),
  ffmpeg: (p) => ({
    filter: echoTaps(v(p, 'delayTime'), v(p, 'feedback'), v(p, 'mix')),
    approximate: 'aecho has no feedback: up to five repeats are listed',
  }),
})

/** Deterministic noise, so a rendered reverb is the same every time. */
function noise(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const reverb = defineEffect({
  type: 'reverb',
  label: 'Reverb',
  description: 'A room around the voice (ConvolverNode with a decaying-noise impulse)',
  params: {
    time: { label: 'Time', defaultValue: 1.2, minValue: 0.1, maxValue: 6, exponent: 2, units: 's' },
    mix: mix(0.3),
    seed: { label: 'Seed', type: 'int', defaultValue: 1, minValue: 1, maxValue: 999, discreteStep: 1 },
  },
  build(context, p) {
    const length = Math.max(1, Math.floor(context.sampleRate * v(p, 'time')))
    const impulse = context.createBuffer(2, length, context.sampleRate)
    const random = noise(v(p, 'seed'))
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c)
      for (let i = 0; i < length; i++) data[i] = (random() * 2 - 1) * (1 - i / length) ** 3
    }
    const convolver = context.createConvolver()
    convolver.buffer = impulse
    const { input, output } = parallel(context, 1)
    const wet = context.createGain()
    wet.gain.value = v(p, 'mix')
    input.connect(convolver).connect(wet).connect(output)
    return { input, output }
  },
  tail: (p) => v(p, 'time'),
  ffmpeg: (p) => {
    const time = v(p, 'time')
    const taps = [0.029, 0.047, 0.071, 0.113, 0.167, 0.241, 0.353, 0.5, 0.71, 1].map((f) => f * time)
    const decays = taps.map((t) => round(v(p, 'mix') * (1 - t / time) ** 3 + 0.001, 3))
    return {
      filter: `aecho=1:1:${taps.map(ms).join('|')}:${decays.join('|')}`,
      approximate: 'a multi-tap echo in place of the convolution; for the same room, render the impulse and use afir',
    }
  },
})

/* -------------------------------------------------------------------------- */
/* Color                                                                      */
/* -------------------------------------------------------------------------- */

const distortion = defineEffect({
  type: 'distortion',
  label: 'Distortion',
  description: 'Rough, saturated (WaveShaperNode with a tanh curve)',
  params: { amount: { label: 'Amount', defaultValue: 0.2, minValue: 0, maxValue: 1 } },
  build(context, p) {
    const shaper = context.createWaveShaper()
    const k = 1 + v(p, 'amount') * 20
    const curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 511.5 - 1) * k) / Math.tanh(k)
    shaper.curve = curve
    shaper.oversample = '2x'
    return { input: shaper, output: shaper }
  },
  ffmpeg: (p) => {
    const k = 1 + v(p, 'amount') * 20
    return `volume=${round(k)},asoftclip=type=tanh,volume=${round(1 / Math.tanh(k))}`
  },
})

const ringmod = defineEffect({
  type: 'ringmod',
  label: 'Ring modulator',
  description: 'The voice multiplied by a tone: metallic, robotic (30–50 Hz is the classic robot)',
  params: { frequency: frequency(40, 1, 2000), mix: mix(0.8) },
  build(context, p) {
    const lfos = oscillators(context)
    const { input, output } = parallel(context, 1 - v(p, 'mix'))
    const modulated = context.createGain()
    modulated.gain.value = 0
    lfos.lfo(v(p, 'frequency')).connect(modulated.gain)
    const wet = context.createGain()
    wet.gain.value = v(p, 'mix')
    input.connect(modulated).connect(wet).connect(output)
    return { input, output, dispose: lfos.dispose }
  },
  // Needs a second input (a sine source and amultiply): not expressible as a single chain.
  ffmpeg: () => undefined,
})

const dispersion = defineEffect({
  type: 'dispersion',
  label: 'Dispersion',
  description: 'Each frequency arrives at a different time: the "pew" of a stone on ice, a laser (all-pass filters in series, with a short echo)',
  params: {
    stages: { label: 'Stages', type: 'int', defaultValue: 88, minValue: 2, maxValue: 160, discreteStep: 2 },
    frequency: frequency(1750, 100, 8000),
    Q: bandwidth(0.6),
    feedback: { label: 'Feedback', defaultValue: 0.7, minValue: 0, maxValue: 0.9 },
    mix: mix(0.85),
  },
  build(context, p) {
    const input = context.createGain()
    const output = context.createGain()
    const sum = context.createGain()
    let node: AudioNode = sum
    for (let i = 0; i < v(p, 'stages'); i++) {
      const allpass = context.createBiquadFilter()
      allpass.type = 'allpass'
      allpass.frequency.value = v(p, 'frequency')
      allpass.Q.value = v(p, 'Q')
      node.connect(allpass)
      node = allpass
    }
    input.connect(sum)
    const echo = context.createDelay(0.2)
    echo.delayTime.value = 0.03
    const feedback = context.createGain()
    feedback.gain.value = v(p, 'feedback')
    node.connect(echo).connect(feedback).connect(sum)
    const dry = context.createGain()
    dry.gain.value = 1 - v(p, 'mix') * 0.5
    const wet = context.createGain()
    wet.gain.value = v(p, 'mix')
    input.connect(dry).connect(output)
    node.connect(wet).connect(output)
    return { input, output }
  },
  tail: (p) => ringOut(0.03, v(p, 'feedback')),
  ffmpeg: (p) => {
    const stage = `allpass=f=${v(p, 'frequency')}:t=q:w=${v(p, 'Q')}`
    const chain = Array.from({ length: v(p, 'stages') }, () => stage).join(',')
    return {
      filter: `asplit[dry][w];[w]${chain},${echoTaps(0.03, v(p, 'feedback'), 1, 8)},volume=${v(p, 'mix')}[wet];[dry]volume=${round(1 - v(p, 'mix') * 0.5)}[d];[d][wet]amix=inputs=2:normalize=0`,
      approximate: 'the feedback through the all-pass filters becomes repeats of the filtered signal',
    }
  },
})

/** The effect types every chain understands. */
export const builtinEffects: EffectDefinition[] = [
  ...filters,
  gain,
  compressor,
  limiter,
  gate,
  varispeed,
  vibrato,
  tremolo,
  chorus,
  delay,
  reverb,
  distortion,
  ringmod,
  dispersion,
]

export type { EffectNodes, FfmpegFilter }
