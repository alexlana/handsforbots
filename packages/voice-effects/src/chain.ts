import type { EffectsInstance, Prosody, SpeechAudio, SpeechEffects } from '@handsforbots/voice'
import { builtinEffects } from './effects.js'
import { presets, type PresetName } from './presets.js'
import type { EffectChain, EffectDefinition, EffectParams, EffectSpec } from './types.js'

export type Registry = ReadonlyMap<string, EffectDefinition>

export const createRegistry = (extra: EffectDefinition[] = []): Registry =>
  new Map([...builtinEffects, ...extra].map((definition) => [definition.type, definition]))

const RESERVED = new Set(['type', 'id', 'bypass'])
const PROSODY = ['rate', 'pitch', 'volume'] as const

/** Problems with a chain, as readable sentences (empty = valid). */
export function validateChain(chain: unknown, registry: Registry = createRegistry()): string[] {
  const errors: string[] = []
  if (!chain || typeof chain !== 'object') return ['the chain must be an object']
  const c = chain as Partial<EffectChain>
  if (c.version !== 1) errors.push('version must be 1')
  if (c.prosody !== undefined) {
    if (!c.prosody || typeof c.prosody !== 'object') errors.push('prosody must be an object')
    else
      for (const [key, value] of Object.entries(c.prosody)) {
        if (!(PROSODY as readonly string[]).includes(key)) errors.push(`prosody.${key} is not rate, pitch or volume`)
        else if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`prosody.${key} must be a number`)
        else if (key === 'rate' && value <= 0) errors.push('prosody.rate must be above 0')
      }
  }
  if (!Array.isArray(c.effects)) return [...errors, 'effects must be an array']
  c.effects.forEach((spec, index) => {
    const at = `effects[${index}]`
    if (!spec || typeof spec !== 'object') return errors.push(`${at} must be an object`)
    const definition = registry.get(String(spec.type))
    if (!definition) return errors.push(`${at}: unknown effect type "${String(spec.type)}"`)
    for (const [key, value] of Object.entries(spec)) {
      if (RESERVED.has(key)) continue
      const info = definition.params[key]
      if (!info) {
        errors.push(`${at}.${key}: "${definition.type}" has no such parameter`)
        continue
      }
      const number = typeof value === 'boolean' && info.type === 'boolean' ? Number(value) : value
      if (typeof number !== 'number' || !Number.isFinite(number)) errors.push(`${at}.${key} must be a number`)
      else if (number < info.minValue || number > info.maxValue)
        errors.push(`${at}.${key} = ${number} is outside ${info.minValue}–${info.maxValue}`)
    }
    if (spec.bypass !== undefined && typeof spec.bypass !== 'boolean') errors.push(`${at}.bypass must be a boolean`)
    if (spec.id !== undefined && typeof spec.id !== 'string') errors.push(`${at}.id must be a string`)
  })
  return errors
}

/** Every parameter of an effect, with defaults filled in and integers rounded. */
export function paramsOf(spec: EffectSpec, definition: EffectDefinition): EffectParams {
  const params: EffectParams = {}
  for (const [key, info] of Object.entries(definition.params)) {
    const raw = spec[key]
    let value = typeof raw === 'number' ? raw : typeof raw === 'boolean' ? Number(raw) : info.defaultValue
    if (info.type === 'int' || info.type === 'choice' || info.type === 'boolean') value = Math.round(value)
    params[key] = Math.min(info.maxValue, Math.max(info.minValue, value))
  }
  return params
}

const copy = (chain: EffectChain): EffectChain => JSON.parse(JSON.stringify(chain)) as EffectChain

export type ResolvedEffect = { spec: EffectSpec; definition: EffectDefinition; params: EffectParams }

/** The effects that apply (not bypassed), with their parameters. */
export function activeEffects(chain: EffectChain, registry: Registry): ResolvedEffect[] {
  return chain.effects
    .filter((spec) => !spec.bypass)
    .map((spec) => {
      const definition = registry.get(spec.type)
      if (!definition) throw new TypeError(`Unknown effect type "${spec.type}"`)
      return { spec, definition, params: paramsOf(spec, definition) }
    })
}

/** Runs the sample-level effects (`process`) in order. */
export function processSamples(audio: SpeechAudio, effects: ResolvedEffect[]): SpeechAudio {
  let out = audio
  for (const { definition, params } of effects) if (definition.process) out = definition.process(out, params)
  return out
}

/** Builds the Web Audio graph of the chain after `source`. */
export function connectEffects(context: BaseAudioContext, source: AudioBufferSourceNode, effects: ResolvedEffect[]): EffectsInstance {
  let node: AudioNode = source
  let tail = 0
  const disposers: (() => void)[] = []
  for (const { definition, params } of effects) {
    if (!definition.build) continue
    const built = definition.build(context, params, source)
    node.connect(built.input)
    node = built.output
    tail += definition.tail?.(params) ?? 0
    if (built.dispose) disposers.push(built.dispose)
  }
  return { output: node, tail, dispose: () => disposers.splice(0).forEach((dispose) => dispose()) }
}

export type RenderOptions = {
  /** Offline context factory (tests, or a worker without the global). Default `new OfflineAudioContext(...)`. */
  createContext?: (length: number, sampleRate: number) => OfflineAudioContext
  /** Playback rate before the effects (the pitch part of the prosody, as the voice player applies it). */
  playbackRate?: number
}

/** Renders `audio` through the chain, offline, tails included. */
export async function renderEffects(
  audio: SpeechAudio,
  effects: ResolvedEffect[],
  options: RenderOptions = {},
): Promise<SpeechAudio> {
  const processed = processSamples(audio, effects)
  const { sampleRate } = processed
  let speed = options.playbackRate ?? 1
  let tail = 0.2
  for (const { definition, params } of effects) {
    speed *= definition.speed?.(params) ?? 1
    tail += definition.tail?.(params) ?? 0
  }
  const length = Math.ceil((processed.samples.length / sampleRate / speed + tail) * sampleRate)
  const context = options.createContext?.(length, sampleRate) ?? new OfflineAudioContext(1, length, sampleRate)
  const buffer = context.createBuffer(1, Math.max(1, processed.samples.length), sampleRate)
  buffer.getChannelData(0).set(processed.samples)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = options.playbackRate ?? 1
  const instance = connectEffects(context, source, effects)
  instance.output.connect(context.destination)
  source.start()
  const rendered = await context.startRendering()
  instance.dispose?.()
  return { samples: rendered.getChannelData(0).slice(), sampleRate }
}

export type VoiceEffectsOptions = {
  /** Your own effect types, next to the built-in ones. */
  effects?: EffectDefinition[]
}

/** A live chain: plug it into `voice({ effects })` and change it while the bot talks. */
export type VoiceEffects = SpeechEffects & {
  /** A copy of the chain. */
  get(): EffectChain
  /** Replaces the chain (or loads a preset by name). Throws on an invalid chain. */
  set(chain: EffectChain | PresetName): void
  /** Changes one effect, by index or `id`: parameters, `bypass`. Throws on invalid values. */
  update(target: number | string, patch: Partial<EffectSpec>): void
  /** Changes the prosody. */
  setProsody(prosody: Prosody): void
  /** Called after every change. */
  subscribe(listener: () => void): () => void
  /** The effect types this chain understands (for editors). */
  definitions(): EffectDefinition[]
  /** Renders audio through the chain, offline (to save or to pre-generate fixed lines). */
  render(audio: SpeechAudio, options?: RenderOptions): Promise<SpeechAudio>
}

export function resolveChain(chain: EffectChain | PresetName): EffectChain {
  if (typeof chain !== 'string') return chain
  const preset = presets[chain]
  if (!preset) throw new TypeError(`Unknown preset "${chain}"`)
  return preset
}

/** A chain of effects for synthesized speech, from JSON or a preset name. */
export function voiceEffects(initial: EffectChain | PresetName = 'clean', options: VoiceEffectsOptions = {}): VoiceEffects {
  const registry = createRegistry(options.effects)
  const listeners = new Set<() => void>()
  const checked = (next: EffectChain) => {
    const errors = validateChain(next, registry)
    if (errors.length) throw new TypeError(`Invalid effect chain: ${errors.join('; ')}`)
    return copy(next)
  }
  let chain = checked(resolveChain(initial))
  const changed = () => listeners.forEach((listener) => listener())

  return {
    get name() {
      return chain.name ?? 'voice-effects'
    },
    prosody: () => ({ ...chain.prosody }),
    process: (audio) => processSamples(audio, activeEffects(chain, registry)),
    connect: (context, source) => connectEffects(context, source, activeEffects(chain, registry)),
    get: () => copy(chain),
    set(next) {
      chain = checked(resolveChain(next))
      changed()
    },
    update(target, patch) {
      const index = typeof target === 'number' ? target : chain.effects.findIndex((e) => e.id === target)
      const current = chain.effects[index]
      if (!current) throw new RangeError(`No effect ${JSON.stringify(target)} in the chain`)
      const effects = [...chain.effects]
      effects[index] = { ...current, ...patch, type: patch.type ?? current.type }
      chain = checked({ ...chain, effects })
      changed()
    },
    setProsody(prosody) {
      chain = checked({ ...chain, prosody: { ...prosody } })
      changed()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    definitions: () => [...registry.values()],
    render: (audio, renderOptions) => renderEffects(audio, activeEffects(chain, registry), renderOptions),
  }
}
