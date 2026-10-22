import type { LoadProgress, ProsodySupport, SpeakOptions, SpeechAudio, TextToSpeech } from '@handsforbots/voice'

/**
 * Runs a provider in a Web Worker, so synthesis (phonemizer and model) never
 * blocks the page. The worker file builds the provider and calls `serveTTS`;
 * the page gets an ordinary `TextToSpeech` from `workerTTS`. Functions do not
 * cross to a worker, so the phonemizer, the runtime and the model URLs are
 * chosen in the worker file; `config` carries plain data (a voice id, for
 * example) from the page.
 */

/** The side of the worker `serveTTS` talks through: the worker's global scope by default. */
export type TtsWorkerScope = {
  postMessage(message: unknown, transfer: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
}

/** What `workerTTS` needs from a worker. A `Worker` fits; tests can pass a `MessagePort` wrapper. */
export type TtsWorker = {
  postMessage(message: unknown, transfer?: Transferable[]): void
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void): void
  terminate(): void
}

/** The provider, or a function that builds it from the page's `config`. */
export type TtsWorkerSource<Config = unknown> = TextToSpeech | ((config: Config) => TextToSpeech | Promise<TextToSpeech>)

export type WorkerTTSOptions<Config = unknown> = {
  /**
   * Creates the worker, on the first `load` or `synthesize`. Write it in your
   * app so the bundler finds the file:
   * `() => new Worker(new URL('./voice.worker.js', import.meta.url), { type: 'module' })`.
   */
  worker: () => TtsWorker
  /** Plain data (structured clone) handed to the worker's factory. */
  config?: Config
  /** Provider name (unique among your providers; `ttsStatus` and `loadSpeech` use it). Default 'worker'. */
  name?: string
  /** Bytes `load` downloads, for the UI before the worker answers. */
  size?: number
  /** Prosody the provider applies, until the worker reports its own. */
  prosody?: ProsodySupport
}

export type WorkerTextToSpeech = TextToSpeech & {
  /** Stops the worker and rejects what is pending; the next call starts a new one. */
  terminate(): void
}

const TAG = 'h4b:tts'

type Request =
  | { tag: typeof TAG; type: 'init'; config: unknown }
  | { tag: typeof TAG; type: 'load'; id: number }
  | { tag: typeof TAG; type: 'synthesize'; id: number; text: string; options: Omit<SpeakOptions, 'signal'> }
  | { tag: typeof TAG; type: 'abort'; id: number }

type ReplyBody =
  | { type: 'info'; name: string; prosody?: ProsodySupport; size?: number }
  | { type: 'progress'; id: number; progress: LoadProgress }
  | { type: 'done'; id: number; audio?: SpeechAudio }
  | { type: 'error'; id?: number; error: { name: string; message: string } }

type Reply = ReplyBody & { tag: typeof TAG }

const errorData = (error: unknown) => ({
  name: (error as Error)?.name ?? 'Error',
  message: (error as Error)?.message ?? String(error),
})

const errorFrom = ({ name, message }: { name: string; message: string }) => Object.assign(new Error(message), { name })

const abortError = () => errorFrom({ name: 'AbortError', message: 'Aborted' })

/**
 * Transfers the samples when they own their buffer; copies them when they are
 * a view on a larger buffer (WebAssembly memory, for example), which must not
 * be detached.
 */
function transferable(audio: SpeechAudio): { audio: SpeechAudio; transfer: Transferable[] } {
  const { samples } = audio
  const owned =
    samples.buffer instanceof ArrayBuffer && samples.byteOffset === 0 && samples.byteLength === samples.buffer.byteLength
  const own = owned ? samples : samples.slice()
  return { audio: { samples: own, sampleRate: audio.sampleRate }, transfer: [own.buffer as ArrayBuffer] }
}

/**
 * Answers `workerTTS` from inside a worker. Call it once in the worker file:
 *
 * ```js
 * serveTTS((config) => piperTTS({ ...piperVoice(config.voice), phonemizer, runtime }))
 * ```
 */
export function serveTTS<Config = unknown>(
  source: TtsWorkerSource<Config>,
  scope: TtsWorkerScope = globalThis as unknown as TtsWorkerScope,
): void {
  let provider: Promise<TextToSpeech> | undefined = typeof source === 'function' ? undefined : Promise.resolve(source)
  const running = new Map<number, AbortController>()
  const reply = (message: ReplyBody, transfer: Transferable[] = []) =>
    scope.postMessage({ tag: TAG, ...message }, transfer)

  const describe = (p: TextToSpeech) => reply({ type: 'info', name: p.name, prosody: p.prosody, size: p.size })

  const run = async (id: number, job: (p: TextToSpeech, signal: AbortSignal) => Promise<void>) => {
    const controller = new AbortController()
    running.set(id, controller)
    try {
      if (!provider) throw new Error('serveTTS got a request before its config')
      await job(await provider, controller.signal)
    } catch (error) {
      reply({ type: 'error', id, error: errorData(error) })
    } finally {
      running.delete(id)
    }
  }

  scope.addEventListener('message', (event) => {
    const request = event.data as Request
    if (request?.tag !== TAG) return
    switch (request.type) {
      case 'init':
        provider ??= Promise.resolve().then(() => (source as (config: Config) => TextToSpeech | Promise<TextToSpeech>)(request.config as Config))
        provider.then(describe, (error) => reply({ type: 'error', error: errorData(error) }))
        return
      case 'load':
        void run(request.id, async (p, signal) => {
          await p.load?.((progress) => reply({ type: 'progress', id: request.id, progress }), signal)
          reply({ type: 'done', id: request.id })
        })
        return
      case 'synthesize':
        void run(request.id, async (p, signal) => {
          if (!p.synthesize) throw new Error(`Provider "${p.name}" cannot synthesize`)
          const { audio, transfer } = transferable(await p.synthesize(request.text, { ...request.options, signal }))
          reply({ type: 'done', id: request.id, audio }, transfer)
        })
        return
      case 'abort':
        running.get(request.id)?.abort()
        return
    }
  })
}

type Pending = {
  resolve(audio: SpeechAudio | undefined): void
  reject(error: Error): void
  onProgress?: (progress: LoadProgress) => void
}

/**
 * A `TextToSpeech` whose synthesis runs in a worker that calls `serveTTS`.
 * If the worker fails to start (a browser without module workers, a missing
 * file), `load` rejects and the voice plugin moves on to the next provider.
 */
export function workerTTS<Config = unknown>(options: WorkerTTSOptions<Config>): WorkerTextToSpeech {
  let worker: TtsWorker | undefined
  let prosody: ProsodySupport | undefined
  let nextId = 0
  const pending = new Map<number, Pending>()

  const failAll = (error: Error) => {
    for (const job of pending.values()) job.reject(error)
    pending.clear()
  }

  const stop = (error: Error) => {
    worker?.terminate()
    worker = undefined
    failAll(error)
  }

  const start = (): TtsWorker => {
    if (worker) return worker
    const created = options.worker()
    worker = created
    created.addEventListener('message', (event) => {
      const reply = (event as MessageEvent).data as Reply
      if (reply?.tag !== TAG || created !== worker) return
      if (reply.type === 'info') {
        prosody = reply.prosody
        return
      }
      if (reply.id === undefined) {
        if (reply.type === 'error') stop(errorFrom(reply.error))
        return
      }
      const job = pending.get(reply.id)
      if (!job) return
      if (reply.type === 'progress') return job.onProgress?.(reply.progress)
      pending.delete(reply.id)
      if (reply.type === 'done') job.resolve(reply.audio)
      else job.reject(errorFrom(reply.error))
    })
    // A worker that cannot start (module workers unsupported, 404, syntax error) only reports here.
    const broken = (event: Event) => {
      if (created !== worker) return
      const message = (event as ErrorEvent).message
      stop(new Error(`Speech worker failed${message ? `: ${message}` : ''}`))
    }
    created.addEventListener('error', broken)
    created.addEventListener('messageerror', broken)
    created.postMessage({ tag: TAG, type: 'init', config: options.config })
    return created
  }

  const request = (
    message: Record<string, unknown>,
    signal?: AbortSignal,
    onProgress?: (progress: LoadProgress) => void,
  ): Promise<SpeechAudio | undefined> =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError())
      let target: TtsWorker
      try {
        target = start()
      } catch (error) {
        return reject(error as Error)
      }
      const id = ++nextId
      const onAbort = () => {
        if (!pending.delete(id)) return
        target.postMessage({ tag: TAG, type: 'abort', id })
        reject(abortError())
      }
      const settle = () => signal?.removeEventListener('abort', onAbort)
      pending.set(id, {
        onProgress,
        resolve: (audio) => (settle(), resolve(audio)),
        reject: (error) => (settle(), reject(error)),
      })
      signal?.addEventListener('abort', onAbort, { once: true })
      target.postMessage({ tag: TAG, id, ...message })
    })

  return {
    name: options.name ?? 'worker',
    remote: false,
    size: options.size,
    get prosody() {
      return prosody ?? options.prosody
    },
    isSupported: () => typeof Worker !== 'undefined' && typeof WebAssembly === 'object',
    load: async (onProgress, signal) => void (await request({ type: 'load' }, signal, onProgress)),
    async synthesize(text, { signal, ...speakOptions }) {
      const audio = await request({ type: 'synthesize', text, options: speakOptions }, signal)
      if (!audio) throw new Error('Speech worker returned no audio')
      return audio
    },
    terminate: () => stop(errorFrom({ name: 'AbortError', message: 'Speech worker terminated' })),
  }
}
