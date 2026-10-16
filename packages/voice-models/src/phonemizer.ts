import type { LoadProgress } from '@handsforbots/voice'
import { fetchModel, progressOf, type ModelCache, type ModelSource } from './fetch.js'

/**
 * Text to phonemes (IPA). Piper and Kokoro read phonemes, not letters; which
 * phonemizer you use decides the pronunciation and the license you take on.
 */
export type Phonemizer = {
  name: string
  /** Downloads what it needs; engines call it from their own `load`. */
  load?(onProgress: (progress: LoadProgress) => void, signal: AbortSignal): Promise<void>
  /** Bytes `load` downloads, if known. */
  size?: number
  /** IPA phonemes of `text`, one string per phoneme, punctuation and spaces included. */
  phonemize(text: string, language: string): Promise<string[]>
}

/** An Emscripten module built from piper-phonemize (espeak-ng). */
type PhonemizeModule = { callMain(args: string[]): unknown }
export type PiperPhonemizeFactory = (moduleArg: Record<string, unknown>) => Promise<PhonemizeModule>

export type EspeakPhonemizerOptions = {
  /**
   * Loads the piper-phonemize factory: `() => import('./piper_phonemize.js')`
   * (a module exporting `createPiperPhonemize`) or `async () => createPiperPhonemize`.
   * Builds: `@diffusionstudio/piper-wasm` (wrapper MIT, espeak-ng inside is
   * GPL-3.0) or your own. The H4B packages do not ship espeak-ng.
   */
  module: () => Promise<PiperPhonemizeFactory | { createPiperPhonemize: PiperPhonemizeFactory }>
  /** `piper_phonemize.wasm`. */
  wasm: ModelSource
  /** `piper_phonemize.data` (espeak-ng voices; a build with only your languages is much smaller). */
  data: ModelSource
  /** BCP 47 → espeak-ng voice. Default: the tag in lower case (`pt-BR` → `pt-br`). */
  voices?: Record<string, string>
  cache?: ModelCache | false
  /** Bytes of wasm + data, for progress before the download starts. */
  size?: number
}

/** espeak-ng in WebAssembly, through a piper-phonemize build (the phonemizer Piper voices were trained with). */
export function espeakPhonemizer(options: EspeakPhonemizerOptions): Phonemizer {
  let ready: Promise<{ factory: PiperPhonemizeFactory; wasm: WebAssembly.Module; data: Uint8Array }> | undefined
  let queue: Promise<unknown> = Promise.resolve()

  const resolveFactory = async (): Promise<PiperPhonemizeFactory> => {
    const loaded = await options.module()
    return typeof loaded === 'function' ? loaded : loaded.createPiperPhonemize
  }

  const load = (onProgress?: (progress: LoadProgress) => void, signal?: AbortSignal) => {
    ready ??= (async () => {
      const progress = progressOf(onProgress ?? (() => {}), options.size)
      const [factory, wasmBytes, data] = await Promise.all([
        resolveFactory(),
        fetchModel(options.wasm, { onProgress: progress('wasm'), signal, cache: options.cache }),
        fetchModel(options.data, { onProgress: progress('data'), signal, cache: options.cache }),
      ])
      return { factory, wasm: await WebAssembly.compile(wasmBytes as BufferSource), data }
    })().catch((error) => {
      ready = undefined
      throw error
    })
    return ready
  }

  const run = async (text: string, voice: string): Promise<string[]> => {
    const { factory, wasm, data } = await load()
    return new Promise((resolve, reject) => {
      // piper-phonemize is a program: one module per call, instantiated from the compiled wasm.
      void factory({
        print: (line: string) => {
          try {
            resolve((JSON.parse(line) as { phonemes: string[] }).phonemes)
          } catch (error) {
            reject(error)
          }
        },
        printErr: (message: string) => reject(new Error(`espeak-ng: ${message}`)),
        instantiateWasm: (imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) => {
          void WebAssembly.instantiate(wasm, imports).then((instance) => receive(instance, wasm), reject)
          return {}
        },
        getPreloadedPackage: () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        locateFile: (path: string) => path,
      }).then((mod) => mod.callMain(['-l', voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']), reject)
    })
  }

  return {
    name: 'espeak-ng',
    size: options.size,
    load: async (onProgress, signal) => void (await load(onProgress, signal)),
    phonemize(text, language) {
      const voice = options.voices?.[language] ?? language.toLowerCase().replace('_', '-')
      const job = queue.then(() => run(text.trim(), voice))
      queue = job.catch(() => undefined)
      return job
    },
  }
}
