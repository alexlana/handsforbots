import type { LoadProgress, SpeechAudio, TextToSpeech } from '@handsforbots/voice'
import { fetchJson, fetchModel, huggingFace, progressOf, type ModelCache, type ModelSource } from './fetch.js'
import { chunkText, concatAudio, float32, int64, loadRuntime, type OnnxRuntime, type OnnxSession, type RuntimeSource } from './onnx.js'
import type { Phonemizer } from './phonemizer.js'

/** The `.onnx.json` that comes with every Piper voice. */
export type PiperConfig = {
  audio: { sample_rate: number }
  espeak?: { voice: string }
  inference?: { noise_scale?: number; length_scale?: number; noise_w?: number }
  phoneme_id_map: Record<string, number[]>
  num_speakers?: number
  speaker_id_map?: Record<string, number>
}

export type PiperOptions = {
  /** Provider name (unique among your providers). Default 'piper'. */
  name?: string
  /** The `.onnx` file (fp32 or quantized). */
  model: ModelSource
  /** The `.onnx.json` file. */
  config: ModelSource
  phonemizer: Phonemizer
  runtime: RuntimeSource
  /** For multi-speaker voices: a name from `speaker_id_map` or a number. Default 0. */
  speaker?: string | number
  /** Override the voice's inference settings. */
  noiseScale?: number
  lengthScale?: number
  noiseW?: number
  /** Passed to `InferenceSession.create` (e.g. `{ executionProviders: ['wasm'] }`). */
  sessionOptions?: Record<string, unknown>
  cache?: ModelCache | false
  /** Bytes to download, for progress before the download starts. */
  size?: number
}

/**
 * Hugging Face files of a voice in rhasspy/piper-voices, by its id
 * (`pt_BR-faber-medium`, `en_US-lessac-medium`…). Licenses vary per voice:
 * read its MODEL_CARD.
 */
export function piperVoice(id: string, options: { revision?: string } = {}): { model: ModelSource; config: ModelSource } {
  const [locale, name, quality] = id.split('-')
  if (!locale || !name || !quality) throw new TypeError(`Piper voice ids look like "pt_BR-faber-medium", got "${id}"`)
  const path = `${locale.split('_')[0]}/${locale}/${name}/${quality}/${id}`
  return {
    model: huggingFace('rhasspy/piper-voices', `${path}.onnx`, options),
    config: huggingFace('rhasspy/piper-voices', `${path}.onnx.json`, options),
  }
}

/** Phonemes → Piper ids: BOS, pad, (id, pad)*, EOS, with the voice's own map. */
export function piperIds(phonemes: string[], map: Record<string, number[]>): number[] {
  const id = (symbol: string) => map[symbol]?.[0]
  const pad = id('_') ?? 0
  const ids = [id('^') ?? 1, pad]
  for (const phoneme of phonemes) {
    for (const symbol of map[phoneme] ? [phoneme] : [...phoneme]) {
      const value = id(symbol)
      if (value !== undefined) ids.push(value, pad)
    }
  }
  ids.push(id('$') ?? 2)
  return ids
}

type Loaded = { ort: OnnxRuntime; session: OnnxSession; config: PiperConfig }

/** A Piper voice (VITS, ONNX) running in the page. Fast on CPU; one language per voice. */
export function piperTTS(options: PiperOptions): TextToSpeech & { readonly config?: PiperConfig } {
  let loaded: Promise<Loaded> | undefined
  let current: Loaded | undefined

  const load = (onProgress: (progress: LoadProgress) => void = () => {}, signal?: AbortSignal) => {
    loaded ??= (async () => {
      const progress = progressOf(onProgress, options.size)
      const [ort, config, model] = await Promise.all([
        loadRuntime(options.runtime),
        fetchJson<PiperConfig>(options.config, { onProgress: progress('config'), signal, cache: options.cache }),
        fetchModel(options.model, { onProgress: progress('model'), signal, cache: options.cache }),
        options.phonemizer.load?.(progress('phonemizer'), signal ?? new AbortController().signal),
      ])
      const session = await ort.InferenceSession.create(model, options.sessionOptions)
      current = { ort, session, config }
      return current
    })().catch((error) => {
      loaded = undefined
      throw error
    })
    return loaded
  }

  return {
    name: options.name ?? 'piper',
    remote: false,
    size: options.size,
    prosody: { rate: true },
    get config() {
      return current?.config
    },
    isSupported: () => typeof WebAssembly === 'object',
    load: async (onProgress, signal) => void (await load(onProgress, signal)),
    async synthesize(text, speakOptions): Promise<SpeechAudio> {
      const { ort, session, config } = await load()
      const inference = config.inference ?? {}
      const lengthScale = (options.lengthScale ?? inference.length_scale ?? 1) / (speakOptions.prosody?.rate ?? 1)
      const scales = [options.noiseScale ?? inference.noise_scale ?? 0.667, lengthScale, options.noiseW ?? inference.noise_w ?? 0.8]
      const speaker =
        typeof options.speaker === 'string' ? (config.speaker_id_map?.[options.speaker] ?? 0) : (options.speaker ?? 0)
      const language = config.espeak?.voice ?? speakOptions.language
      const parts: Float32Array[] = []
      for (const chunk of chunkText(text)) {
        if (speakOptions.signal?.aborted) break
        const ids = piperIds(await options.phonemizer.phonemize(chunk, language), config.phoneme_id_map)
        const feeds: Record<string, ReturnType<typeof int64>> = {
          input: int64(ort, ids, [1, ids.length]),
          input_lengths: int64(ort, [ids.length]),
          scales: float32(ort, scales),
        }
        if ((config.num_speakers ?? 1) > 1 || session.inputNames.includes('sid')) feeds.sid = int64(ort, [speaker])
        const out = await session.run(feeds)
        parts.push((out.output ?? out[session.outputNames[0]!])!.data as Float32Array)
      }
      return { samples: concatAudio(parts), sampleRate: config.audio.sample_rate }
    },
  }
}
