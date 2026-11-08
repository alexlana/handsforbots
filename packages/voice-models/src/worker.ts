import type { LoadProgress, ProsodySupport, SpeakOptions, SpeechAudio, TextToSpeech, TtsTraceEvent } from '@handsforbots/voice'

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
  /**
   * Each step of the worker's life, for logs and debugging (the voice plugin
   * emits them as `voice.tts`). `worker` numbers the workers of the page, so a
   * reply can be matched with the worker that got its request:
   * `worker.created`, `worker.init` (config sent; `attempt` 1 on creation, 2
   * when `worker.ready` arrives), `worker.ready` (the worker started
   * listening), `worker.info` (the provider it built; `inits`: how many
   * configs had reached the worker, so 1 after two attempts means the first
   * was lost),
   * `worker.error`, `worker.terminated`, `request` (`type`: `load` or
   * `synthesize`, `chars`), `reply` (`ms`), `request.error` (`message`),
   * `request.aborted` and `reply.stale` (a reply from a worker already replaced).
   */
  trace(listener: (event: TtsTraceEvent) => void): () => void
}

const TAG = 'h4b:tts'

/** Numbers every worker the page creates, across `workerTTS` instances, for the trace. */
let workerCount = 0

type Request =
  | { tag: typeof TAG; type: 'init'; config: unknown }
  | { tag: typeof TAG; type: 'load'; id: number }
  | { tag: typeof TAG; type: 'synthesize'; id: number; text: string; options: Omit<SpeakOptions, 'signal'> }
  | { tag: typeof TAG; type: 'abort'; id: number }

type ReplyBody =
  | { type: 'ready' }
  | { type: 'info'; name: string; prosody?: ProsodySupport; size?: number; inits: number }
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
  let inits = 0
  const running = new Map<number, AbortController>()
  const reply = (message: ReplyBody, transfer: Transferable[] = []) =>
    scope.postMessage({ tag: TAG, ...message }, transfer)

  const describe = (p: TextToSpeech, received: number) =>
    reply({ type: 'info', name: p.name, prosody: p.prosody, size: p.size, inits: received })

  const run = async (id: number, type: string, job: (p: TextToSpeech, signal: AbortSignal) => Promise<void>) => {
    const controller = new AbortController()
    running.set(id, controller)
    try {
      if (!provider) {
        // The page sends `init` right after creating the worker: if it never arrived, it was lost on the way.
        throw new Error(
          `serveTTS got a ${type} request before its config (${inits ? 'init arrived without a provider' : 'no init reached this worker'})`,
        )
      }
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
        const received = ++inits
        provider ??= Promise.resolve().then(() => (source as (config: Config) => TextToSpeech | Promise<TextToSpeech>)(request.config as Config))
        provider.then((p) => describe(p, received), (error) => reply({ type: 'error', error: errorData(error) }))
        return
      case 'load':
        void run(request.id, 'load', async (p, signal) => {
          await p.load?.((progress) => reply({ type: 'progress', id: request.id, progress }), signal)
          reply({ type: 'done', id: request.id })
        })
        return
      case 'synthesize':
        void run(request.id, 'synthesize', async (p, signal) => {
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
  // Tells the page when the worker started listening: an `init` sent before this may have been lost.
  reply({ type: 'ready' })
}

type Pending = {
  type: string
  sentAt: number
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
  const tracers = new Set<(event: TtsTraceEvent) => void>()
  const emit = (event: TtsTraceEvent) => {
    for (const listener of tracers) {
      try {
        listener(event)
      } catch {
        // A broken logger never stops speech.
      }
    }
  }
  /** The number of the current worker in the trace. */
  let current = 0
  /** Requests waiting for the current worker's `ready`; `undefined` once it is listening. */
  let waiting: Record<string, unknown>[] | undefined
  const post = (message: Record<string, unknown>) => {
    if (waiting) waiting.push(message)
    else worker?.postMessage({ tag: TAG, ...message })
  }

  const failAll = (error: Error) => {
    for (const job of pending.values()) job.reject(error)
    pending.clear()
  }

  const stop = (error: Error) => {
    if (worker) emit({ event: 'worker.terminated', worker: current, reason: error.message })
    worker?.terminate()
    worker = undefined
    waiting = undefined
    failAll(error)
  }

  const start = (): TtsWorker => {
    if (worker) return worker
    const created = options.worker()
    const number = ++workerCount
    const createdAt = Date.now()
    let attempt = 0
    const init = () => {
      created.postMessage({ tag: TAG, type: 'init', config: options.config })
      emit({ event: 'worker.init', worker: number, attempt: ++attempt })
    }
    worker = created
    current = number
    waiting = []
    emit({ event: 'worker.created', worker: number })
    created.addEventListener('message', (event) => {
      const reply = (event as MessageEvent).data as Reply
      if (reply?.tag !== TAG) return
      if (created !== worker) {
        if (reply.type !== 'progress') emit({ event: 'reply.stale', worker: number, current, type: reply.type })
        return
      }
      if (reply.type === 'ready') {
        // Some browsers (WebKit) can drop messages sent while a module worker loads: send the config again
        // (`serveTTS` builds its provider once, so a second `init` changes nothing when the first arrived).
        emit({ event: 'worker.ready', worker: number, ms: Date.now() - createdAt, queued: waiting?.length ?? 0 })
        init()
        // Only now are requests sent: the worker is listening and has its config.
        const queued = waiting ?? []
        waiting = undefined
        for (const message of queued) post(message)
        return
      }
      if (reply.type === 'info') {
        prosody = reply.prosody
        emit({ event: 'worker.info', worker: number, model: reply.name, size: reply.size, inits: reply.inits })
        return
      }
      if (reply.id === undefined) {
        if (reply.type === 'error') {
          emit({ event: 'worker.error', worker: number, message: reply.error.message })
          stop(errorFrom(reply.error))
        }
        return
      }
      const job = pending.get(reply.id)
      if (!job) return
      if (reply.type === 'progress') return job.onProgress?.(reply.progress)
      pending.delete(reply.id)
      const ms = Date.now() - job.sentAt
      if (reply.type === 'done') {
        emit({ event: 'reply', worker: number, id: reply.id, type: job.type, ms })
        job.resolve(reply.audio)
      } else {
        emit({ event: 'request.error', worker: number, id: reply.id, type: job.type, ms, message: reply.error.message })
        job.reject(errorFrom(reply.error))
      }
    })
    // A worker that cannot start (module workers unsupported, 404, syntax error) only reports here.
    const broken = (event: Event) => {
      if (created !== worker) return
      const message = (event as ErrorEvent).message
      emit({ event: 'worker.error', worker: number, message: `${event.type}${message ? `: ${message}` : ''}` })
      stop(new Error(`Speech worker failed${message ? `: ${message}` : ''}`))
    }
    created.addEventListener('error', broken)
    created.addEventListener('messageerror', broken)
    init()
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
      const number = current
      const type = String(message.type)
      const sentAt = Date.now()
      const onAbort = () => {
        if (!pending.delete(id)) return
        emit({ event: 'request.aborted', worker: number, id, type, ms: Date.now() - sentAt })
        if (target !== worker) return reject(abortError())
        const queued = waiting?.findIndex((m) => m.id === id) ?? -1
        if (queued >= 0) waiting!.splice(queued, 1)
        else post({ type: 'abort', id })
        reject(abortError())
      }
      const settle = () => signal?.removeEventListener('abort', onAbort)
      pending.set(id, {
        type,
        sentAt,
        onProgress,
        resolve: (audio) => (settle(), resolve(audio)),
        reject: (error) => (settle(), reject(error)),
      })
      signal?.addEventListener('abort', onAbort, { once: true })
      emit({
        event: 'request',
        worker: number,
        id,
        type,
        ...(typeof message.text === 'string' ? { chars: message.text.length } : {}),
      })
      post({ id, ...message })
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
    trace(listener) {
      tracers.add(listener)
      return () => tracers.delete(listener)
    },
  }
}
