import type { EffectChain } from './types.js'

export type PresetName =
  | 'clean'
  | 'denoise'
  | 'radio'
  | 'telephone'
  | 'megaphone'
  | 'robot'
  | 'underwater'
  | 'cave'
  | 'ice'
  | 'chipmunk'
  | 'giant'

const limiter = { type: 'limiter' }

/** Ready-made chains. Copy one and change it: they are plain JSON. */
export const presets: Record<PresetName, EffectChain> = {
  clean: { version: 1, name: 'clean', description: 'No effects', effects: [] },
  denoise: {
    version: 1,
    name: 'denoise',
    description: 'For quantized models that hiss: a gate in the pauses and a high-pass',
    effects: [{ type: 'gate', threshold: -42, reduction: 30 }, { type: 'highpass', frequency: 80, Q: 0 }, limiter],
  },
  radio: {
    version: 1,
    name: 'radio',
    description: 'AM radio: a narrow band, a bit of saturation, compressed',
    effects: [
      { type: 'highpass', frequency: 300, Q: 0 },
      { type: 'lowpass', frequency: 3400, Q: 0 },
      { type: 'peaking', frequency: 1800, Q: 1, gain: 5 },
      { type: 'distortion', amount: 0.15 },
      { type: 'compressor', threshold: -30, knee: 10, ratio: 6 },
      limiter,
    ],
  },
  telephone: {
    version: 1,
    name: 'telephone',
    description: 'Phone line: 400–3000 Hz with steep edges',
    effects: [
      { type: 'highpass', frequency: 400, Q: 0 },
      { type: 'highpass', frequency: 400, Q: 0 },
      { type: 'lowpass', frequency: 3000, Q: 0 },
      { type: 'lowpass', frequency: 3000, Q: 0 },
      { type: 'peaking', frequency: 1500, Q: 1, gain: 3 },
      limiter,
    ],
  },
  megaphone: {
    version: 1,
    name: 'megaphone',
    description: 'Horn: thin, loud and distorted',
    effects: [
      { type: 'highpass', frequency: 600, Q: 0 },
      { type: 'lowpass', frequency: 3500, Q: 0 },
      { type: 'peaking', frequency: 2000, Q: 1.5, gain: 8 },
      { type: 'distortion', amount: 0.45 },
      limiter,
    ],
  },
  robot: {
    version: 1,
    name: 'robot',
    description: 'Ring modulator at 40 Hz, the classic robot',
    effects: [{ type: 'ringmod', frequency: 40, mix: 0.8 }, { type: 'highpass', frequency: 120, Q: 0 }, { type: 'distortion', amount: 0.1 }, limiter],
  },
  underwater: {
    version: 1,
    name: 'underwater',
    description: 'Muffled, wobbling, in a wet room',
    effects: [
      { type: 'lowpass', frequency: 900, Q: 3 },
      { type: 'chorus', depth: 0.006, mix: 0.6 },
      { type: 'vibrato', rate: 1.5, depth: 0.002 },
      { type: 'reverb', time: 1.5, mix: 0.4 },
      limiter,
    ],
  },
  cave: {
    version: 1,
    name: 'cave',
    description: 'A big stone room with an echo',
    effects: [{ type: 'reverb', time: 3, mix: 0.45 }, { type: 'delay', delayTime: 0.3, feedback: 0.3, mix: 0.25 }, limiter],
  },
  ice: {
    version: 1,
    name: 'ice',
    description: 'The "pew" of a stone on ice over a slightly higher, faster voice',
    effects: [{ type: 'varispeed', rate: 1.2 }, { type: 'dispersion' }, limiter],
  },
  chipmunk: {
    version: 1,
    name: 'chipmunk',
    description: 'Higher and a bit faster (prosody only: works with the browser voice too)',
    prosody: { pitch: 7, rate: 1.1 },
    effects: [],
  },
  giant: {
    version: 1,
    name: 'giant',
    description: 'Lower, slower, with body and some room',
    prosody: { pitch: -5, rate: 0.9 },
    effects: [{ type: 'lowshelf', frequency: 150, gain: 6 }, { type: 'reverb', time: 0.8, mix: 0.2 }, limiter],
  },
}
