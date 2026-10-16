import { activeEffects, createRegistry, resolveChain, type Registry } from './chain.js'
import type { PresetName } from './presets.js'
import type { EffectChain } from './types.js'

export type FfmpegOptions = {
  /** Sample rate of the audio the filter will get (pitch and varispeed depend on it). Default 24000. */
  sampleRate?: number
  /** Include the prosody (rate with `atempo`, pitch with `asetrate`, volume). Default true. */
  prosody?: boolean
  registry?: Registry
}

export type FfmpegExport = {
  /** The filtergraph, for `ffmpeg -af "<filter>"`. */
  filter: string
  /** Effects that FFmpeg reproduces only roughly, or not at all (skipped). */
  warnings: string[]
  /** A full command line. */
  command(input: string, output: string): string
}

/** `atempo` takes 0.5–100 per filter: smaller factors are chained. */
function atempo(factor: number): string[] {
  const filters: string[] = []
  let left = factor
  while (left < 0.5) {
    filters.push('atempo=0.5')
    left /= 0.5
  }
  if (Math.abs(left - 1) > 1e-6) filters.push(`atempo=${Number(left.toFixed(6))}`)
  return filters
}

/**
 * The chain as an FFmpeg filtergraph, to apply the same voice on the server
 * (pre-generated lines, audio from a cloud TTS). Built-in effects map to
 * FFmpeg's audio filters; where FFmpeg differs, `warnings` says how.
 */
export function toFFmpeg(chain: EffectChain | PresetName, options: FfmpegOptions = {}): FfmpegExport {
  const registry = options.registry ?? createRegistry()
  const resolved = resolveChain(chain)
  const sampleRate = options.sampleRate ?? 24000
  const filters: string[] = []
  const warnings: string[] = []

  const prosody = options.prosody === false ? {} : (resolved.prosody ?? {})
  const pitch = 2 ** ((prosody.pitch ?? 0) / 12)
  if (pitch !== 1) filters.push(`asetrate=${Math.round(sampleRate * pitch)}`, `aresample=${sampleRate}`)
  filters.push(...atempo((prosody.rate ?? 1) / pitch))
  if (prosody.volume) filters.push(`volume=${prosody.volume}dB`)

  activeEffects(resolved, registry).forEach(({ spec, definition, params }, index) => {
    const label = spec.id ?? `${definition.type} #${index + 1}`
    const exported = definition.ffmpeg?.(params, { sampleRate })
    if (exported === undefined) {
      warnings.push(`${label}: no FFmpeg equivalent, skipped`)
      return
    }
    if (typeof exported === 'string') filters.push(exported)
    else {
      filters.push(exported.filter)
      if (exported.approximate) warnings.push(`${label}: ${exported.approximate}`)
    }
  })

  const filter = filters.join(',') || 'anull'
  return {
    filter,
    warnings,
    command: (input, output) => `ffmpeg -i ${JSON.stringify(input)} -af ${JSON.stringify(filter)} ${JSON.stringify(output)}`,
  }
}
