import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  builtinEffects,
  chainSchema,
  createRegistry,
  defineEffect,
  paramsOf,
  presets,
  toFFmpeg,
  toSSML,
  validateChain,
  voiceEffects,
  type EffectChain,
  type PresetName,
} from '../src/index.js'
import { fakeContext, FakeNode, FakeParam, path } from './fake-audio.js'

const source = (context: BaseAudioContext) => context.createBufferSource() as unknown as AudioBufferSourceNode & FakeNode

describe('the chain format', () => {
  it('every preset is valid', () => {
    for (const [name, chain] of Object.entries(presets)) {
      expect(validateChain(chain), name).toEqual([])
      expect(chain.name).toBe(name)
    }
  })

  it('reports what is wrong, as sentences', () => {
    expect(
      validateChain({
        version: 2,
        prosody: { rate: 0, tone: 1 },
        effects: [{ type: 'flanger' }, { type: 'lowpass', frequency: 5, Qx: 1 }, { type: 'gain', gain: 'loud' }, { type: 'gate', bypass: 'yes' }],
      }),
    ).toEqual([
      'version must be 1',
      'prosody.rate must be above 0',
      'prosody.tone is not rate, pitch or volume',
      'effects[0]: unknown effect type "flanger"',
      'effects[1].frequency = 5 is outside 20–20000',
      'effects[1].Qx: "lowpass" has no such parameter',
      'effects[2].gain must be a number',
      'effects[3].bypass must be a boolean',
    ])
    expect(validateChain(null)).toEqual(['the chain must be an object'])
  })

  it('fills defaults and rounds integers', () => {
    const dispersion = createRegistry().get('dispersion')!
    expect(paramsOf({ type: 'dispersion', stages: 10.6 }, dispersion)).toEqual({ stages: 11, frequency: 1750, Q: 0.6, feedback: 0.7, mix: 0.85 })
  })

  it('has a JSON Schema with one entry per effect type', () => {
    const schema = chainSchema() as any
    const entries = schema.properties.effects.items.oneOf
    expect(entries).toHaveLength(builtinEffects.length)
    const lowpass = entries.find((e: any) => e.properties.type.const === 'lowpass')
    expect(lowpass.properties.frequency).toMatchObject({ type: 'number', minimum: 20, maximum: 20000, default: 4000, description: 'Hz' })
  })
})

describe('voiceEffects', () => {
  it('wires the effects in order, skipping bypassed ones', () => {
    const fx = voiceEffects({
      version: 1,
      effects: [
        { type: 'highpass', frequency: 200 },
        { type: 'distortion', bypass: true },
        { type: 'lowpass', frequency: 3000 },
        { type: 'gain', gain: -6 },
      ],
    })
    const { context } = fakeContext()
    const src = source(context)
    const { output } = fx.connect(context, src)
    expect(path(src)).toEqual(['source', 'biquad:highpass', 'biquad:lowpass', 'gain'])
    expect((output as unknown as FakeNode).kind).toBe('gain')
    expect(((output as any).gain as FakeParam).value).toBeCloseTo(0.501, 3)
  })

  it('varispeed changes the source rate; tails add up; dispose stops the oscillators', () => {
    const fx = voiceEffects({
      version: 1,
      effects: [{ type: 'varispeed', rate: 1.5 }, { type: 'chorus' }, { type: 'reverb', time: 2 }, { type: 'delay', delayTime: 0.1, feedback: 0.5 }],
    })
    const { context, created } = fakeContext()
    const src = source(context)
    src.playbackRate.value = 2
    const instance = fx.connect(context, src)
    expect(src.playbackRate.value).toBe(3)
    expect(instance.tail).toBeCloseTo(2 + 0.1 * (Math.log(0.001) / Math.log(0.5)), 5)
    const lfos = created.filter((n) => n.kind === 'oscillator')
    expect(lfos).toHaveLength(2)
    expect(lfos.every((n) => n.started && !n.stopped)).toBe(true)
    instance.dispose?.()
    expect(lfos.every((n) => n.stopped)).toBe(true)
  })

  it('every built-in effect builds with its defaults', () => {
    for (const definition of builtinEffects) {
      const { context } = fakeContext()
      const src = source(context)
      const fx = voiceEffects({ version: 1, effects: [{ type: definition.type }] })
      expect(() => fx.connect(context, src), definition.type).not.toThrow()
    }
  })

  it('the gate lowers the noise in the pauses and keeps the speech', () => {
    const sampleRate = 16000
    const samples = new Float32Array(sampleRate)
    for (let i = 0; i < samples.length; i++) {
      const hiss = (Math.random() * 2 - 1) * 0.003
      samples[i] = i < sampleRate / 2 ? Math.sin(i / 5) * 0.5 + hiss : hiss
    }
    const out = voiceEffects({ version: 1, effects: [{ type: 'gate', threshold: -40, reduction: 30 }] }).process!({ samples, sampleRate })
    const rms = (a: Float32Array, from: number, to: number) => Math.sqrt(a.slice(from, to).reduce((s, x) => s + x * x, 0) / (to - from))
    expect(rms(out.samples, 1000, 7000) / rms(samples, 1000, 7000)).toBeGreaterThan(0.95)
    expect(rms(out.samples, 12000, 16000) / rms(samples, 12000, 16000)).toBeLessThan(0.1)
  })

  it('changes at runtime: presets, update by id or index, prosody', () => {
    const fx = voiceEffects('radio')
    const listener = vi.fn()
    fx.subscribe(listener)
    expect(fx.name).toBe('radio')
    fx.set({ version: 1, name: 'mine', effects: [{ type: 'lowpass', id: 'abafa' }, { type: 'gain' }] })
    fx.update('abafa', { frequency: 800 })
    fx.update(1, { bypass: true })
    fx.setProsody({ pitch: 2 })
    expect(fx.get()).toEqual({
      version: 1,
      name: 'mine',
      prosody: { pitch: 2 },
      effects: [{ type: 'lowpass', id: 'abafa', frequency: 800 }, { type: 'gain', bypass: true }],
    })
    expect(fx.prosody!()).toEqual({ pitch: 2 })
    expect(listener).toHaveBeenCalledTimes(4)
    expect(() => fx.update('abafa', { frequency: 1 })).toThrow(/outside 20–20000/)
    expect(() => fx.update('nope', {})).toThrow(RangeError)
    expect(() => fx.set('nope' as PresetName)).toThrow(/Unknown preset/)
    // get() is a copy
    fx.get().effects.pop()
    expect(fx.get().effects).toHaveLength(2)
  })

  it('takes custom effect types', () => {
    const flip = defineEffect({
      type: 'flip',
      label: 'Flip',
      params: { amount: { label: 'Amount', defaultValue: 1, minValue: 0, maxValue: 1 } },
      process: (audio, p) => ({ ...audio, samples: audio.samples.map((s) => -s * p.amount!) }),
    })
    const fx = voiceEffects({ version: 1, effects: [{ type: 'flip' }] }, { effects: [flip] })
    expect([...fx.process!({ samples: new Float32Array([0.5]), sampleRate: 8000 }).samples]).toEqual([-0.5])
    expect(fx.definitions().map((d) => d.type)).toContain('flip')
    expect(() => voiceEffects({ version: 1, effects: [{ type: 'flip' }] })).toThrow(/unknown effect type/)
  })
})

describe('SSML', () => {
  it('writes <prosody> with SSML 1.1 units, escaping the text', () => {
    expect(toSSML('Oi & tchau <3', { rate: 1.2, pitch: 2, volume: -3 }, { language: 'pt-BR', voice: 'pt-BR-Francisca' })).toBe(
      '<speak version="1.1" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR"><voice name="pt-BR-Francisca">' +
        '<prosody rate="120%" pitch="+2st" volume="-3dB">Oi &amp; tchau &lt;3</prosody></voice></speak>',
    )
    expect(toSSML('Oi', { pitch: 12 }, { pitch: '%', fragment: true })).toBe('<prosody pitch="+100%">Oi</prosody>')
    expect(toSSML('Oi', {}, { fragment: true })).toBe('Oi')
  })
})

describe('FFmpeg', () => {
  it('maps the prosody and the effects to a filtergraph', () => {
    const chain: EffectChain = {
      version: 1,
      prosody: { rate: 1.25, pitch: 12, volume: -2 },
      effects: [{ type: 'highpass', frequency: 100, Q: 0 }, { type: 'tremolo', rate: 4, depth: 0.5 }, { type: 'ringmod', id: 'robo' }],
    }
    const out = toFFmpeg(chain, { sampleRate: 22050 })
    expect(out.filter).toBe('asetrate=44100,aresample=22050,atempo=0.625,volume=-2dB,highpass=f=100:t=q:w=1,tremolo=f=4:d=0.5')
    expect(out.warnings).toEqual(['robo: no FFmpeg equivalent, skipped'])
    expect(out.command('in.wav', 'out.wav')).toBe(`ffmpeg -i "in.wav" -af "${out.filter}" "out.wav"`)
    expect(toFFmpeg({ version: 1, prosody: { rate: 0.3 }, effects: [] }).filter).toBe('atempo=0.5,atempo=0.6')
    expect(toFFmpeg('clean').filter).toBe('anull')
  })

  const ffmpeg = (() => {
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })()

  it.skipIf(!ffmpeg)('FFmpeg accepts every preset and every effect', () => {
    const chains: [string, EffectChain][] = [
      ...Object.entries(presets),
      ...builtinEffects.map((d): [string, EffectChain] => [d.type, { version: 1, effects: [{ type: d.type }] }]),
    ]
    for (const [name, chain] of chains) {
      const { filter } = toFFmpeg(chain, { sampleRate: 24000 })
      const run = () =>
        execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=0.3:r=24000', '-af', filter, '-f', 'null', '-'], {
          stdio: 'pipe',
        })
      expect(run, `${name}: ${filter}`).not.toThrow()
    }
  }, 60000)
})
