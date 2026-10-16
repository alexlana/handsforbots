import type { LoadProgress, ProsodySupport, SpeechAudio, TextToSpeech } from '@handsforbots/voice'

/** What a transformers.js `text-to-speech` pipeline returns. */
export type TtsPipelineOutput = { audio: Float32Array; sampling_rate: number }
export type TtsPipeline = (text: string, options?: Record<string, unknown>) => Promise<TtsPipelineOutput | TtsPipelineOutput[]>

/** transformers.js reports progress per file (`progress_callback`). */
export type TransformersProgress = { status: string; file?: string; loaded?: number; total?: number }

/** Turns transformers.js progress events into `LoadProgress` over all files. */
export function transformersProgress(onProgress: (progress: LoadProgress) => void) {
  const files = new Map<string, { loaded: number; total: number }>()
  return (event: TransformersProgress) => {
    if (event.status !== 'progress' || !event.file) return
    files.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 })
    let loaded = 0
    let total = 0
    for (const f of files.values()) {
      loaded += f.loaded
      total += f.total
    }
    onProgress({ loaded, total: total || undefined, file: event.file })
  }
}

export type TransformersTTSOptions = {
  name: string
  /**
   * Creates the pipeline, e.g.
   * `(progress) => pipeline('text-to-speech', 'Xenova/mms-tts-por', { progress_callback: transformersProgress(progress) })`
   * after `import { pipeline } from '@huggingface/transformers'`.
   */
  pipeline: (onProgress: (progress: LoadProgress) => void) => Promise<TtsPipeline>
  /** Options for every call (speaker embeddings, `speed`…), or a function of the speak options. */
  call?: Record<string, unknown> | ((options: { voice?: string; rate?: number }) => Record<string, unknown>)
  /** Prosody the model applies through `call` (say `{ rate: true }` if `call` passes a speed). */
  prosody?: ProsodySupport
  size?: number
  remote?: boolean
}

/** Any transformers.js text-to-speech pipeline (MMS, SpeechT5, VITS, Supertonic…) as a provider. */
export function transformersTTS(options: TransformersTTSOptions): TextToSpeech {
  let loaded: Promise<TtsPipeline> | undefined
  const load = (onProgress: (progress: LoadProgress) => void = () => {}) => {
    loaded ??= options.pipeline(onProgress).catch((error) => {
      loaded = undefined
      throw error
    })
    return loaded
  }
  return {
    name: options.name,
    remote: options.remote ?? false,
    size: options.size,
    prosody: options.prosody,
    isSupported: () => typeof WebAssembly === 'object',
    load: async (onProgress) => void (await load(onProgress)),
    async synthesize(text, speakOptions): Promise<SpeechAudio> {
      const run = await load()
      const call =
        typeof options.call === 'function' ? options.call({ voice: speakOptions.voice, rate: speakOptions.prosody?.rate }) : options.call
      const result = await run(text, call)
      const first = Array.isArray(result) ? result[0] : result
      if (!first) throw new Error(`${options.name}: the pipeline returned no audio`)
      return { samples: first.audio, sampleRate: first.sampling_rate }
    },
  }
}
