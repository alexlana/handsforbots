import { MessageChannel, type MessagePort } from 'node:worker_threads'
import type { LoadProgress, SpeakOptions, TextToSpeech } from '@handsforbots/voice'
import { describe, expect, it, vi } from 'vitest'
import { serveTTS, workerTTS, type TtsWorker, type TtsWorkerScope, type TtsWorkerSource } from '../src/index.js'

/** A worker made of a MessageChannel: `serveTTS` on one port, `workerTTS` on the other. */
function channelWorker(source: TtsWorkerSource<any>) {
  const workers: (TtsWorker & { fail(message: string): void; terminated: boolean; ports: [MessagePort, MessagePort] })[] = []
  const create = () => {
    const { port1, port2 } = new MessageChannel()
    serveTTS(source, port1 as unknown as TtsWorkerScope)
    port1.start()
    const errors: ((event: Event) => void)[] = []
    const worker = {
      terminated: false,
      ports: [port1, port2] as [MessagePort, MessagePort],
      postMessage: (message: unknown, transfer?: Transferable[]) => port2.postMessage(message, transfer as never),
      addEventListener: (type: string, listener: (event: Event) => void) => {
        if (type === 'error') errors.push(listener)
        else if (type === 'message') (port2 as MessagePort).addEventListener('message', listener as never)
      },
      terminate: () => {
        worker.terminated = true
        port1.close()
        port2.close()
      },
      fail: (message: string) => errors.forEach((listener) => listener({ message } as ErrorEvent)),
    }
    port2.start()
    workers.push(worker)
    return worker
  }
  return { create, workers }
}

function provider(overrides: Partial<TextToSpeech> = {}): TextToSpeech {
  return {
    name: 'inner',
    prosody: { rate: true },
    isSupported: () => true,
    load: async (onProgress) => {
      onProgress({ loaded: 5, total: 10, file: 'model' })
      onProgress({ loaded: 10, total: 10, file: 'model' })
    },
    synthesize: async (text) => ({ samples: Float32Array.from([text.length, 0.5]), sampleRate: 22050 }),
    ...overrides,
  }
}

const eventually = async (check: () => void) => {
  for (let i = 0; i < 200; i++) {
    try {
      return check()
    } catch {
      await new Promise((resolve) => setImmediate(resolve))
    }
  }
  check()
}

describe('workerTTS + serveTTS', () => {
  it('loads with progress and synthesizes through the worker', async () => {
    const { create, workers } = channelWorker(provider())
    const tts = workerTTS({ worker: create, name: 'piper-worker', size: 10 })
    expect(tts.name).toBe('piper-worker')
    expect(tts.size).toBe(10)
    expect(workers).toHaveLength(0)

    const progress: LoadProgress[] = []
    await tts.load!((p) => progress.push(p), new AbortController().signal)
    expect(progress).toEqual([
      { loaded: 5, total: 10, file: 'model' },
      { loaded: 10, total: 10, file: 'model' },
    ])

    const audio = await tts.synthesize!('hello', { language: 'en-US' })
    expect(Array.from(audio.samples)).toEqual([5, 0.5])
    expect(audio.sampleRate).toBe(22050)
    expect(workers).toHaveLength(1)
    tts.terminate()
  })

  it('builds the provider from the config and reports its prosody', async () => {
    const factory = vi.fn((config: { voice: string }) => provider({ name: config.voice, prosody: { rate: true, pitch: true } }))
    const { create } = channelWorker(factory)
    const tts = workerTTS({ worker: create, config: { voice: 'pt_BR-faber-medium' }, prosody: { rate: true } })
    expect(tts.prosody).toEqual({ rate: true })
    await tts.load!(() => {}, new AbortController().signal)
    expect(factory).toHaveBeenCalledWith({ voice: 'pt_BR-faber-medium' })
    expect(tts.prosody).toEqual({ rate: true, pitch: true })
    expect(tts.name).toBe('worker')
    tts.terminate()
  })

  it('passes the speak options, without the signal', async () => {
    let received: SpeakOptions | undefined
    const { create } = channelWorker(
      provider({
        synthesize: async (_text, options) => {
          received = options
          return { samples: new Float32Array(1), sampleRate: 16000 }
        },
      }),
    )
    const tts = workerTTS({ worker: create })
    await tts.synthesize!('hi', { language: 'pt-BR', voice: 'pf_dora', prosody: { rate: 1.2 }, signal: new AbortController().signal })
    expect(received).toMatchObject({ language: 'pt-BR', voice: 'pf_dora', prosody: { rate: 1.2 } })
    expect(received!.signal).toBeInstanceOf(AbortSignal)
    tts.terminate()
  })

  it('transfers samples that own their buffer and copies views on a larger one', async () => {
    const owned = Float32Array.from([1, 2])
    const memory = new Float32Array(8)
    const view = memory.subarray(2, 4)
    let next = owned
    const { create } = channelWorker(provider({ synthesize: async () => ({ samples: next, sampleRate: 16000 }) }))
    const tts = workerTTS({ worker: create })

    expect(Array.from((await tts.synthesize!('a', { language: 'en' })).samples)).toEqual([1, 2])
    expect(owned.buffer.byteLength).toBe(0)

    next = view
    view.set([3, 4])
    expect(Array.from((await tts.synthesize!('b', { language: 'en' })).samples)).toEqual([3, 4])
    expect(memory.buffer.byteLength).toBe(32)
    tts.terminate()
  })

  it('rejects with the error raised in the worker', async () => {
    const { create } = channelWorker(
      provider({
        load: async () => {
          throw Object.assign(new Error('404 model.onnx'), { name: 'FetchError' })
        },
      }),
    )
    const tts = workerTTS({ worker: create })
    await expect(tts.load!(() => {}, new AbortController().signal)).rejects.toMatchObject({ name: 'FetchError', message: '404 model.onnx' })
    tts.terminate()
  })

  it('rejects when the factory fails and starts a new worker on the next call', async () => {
    let calls = 0
    const { create, workers } = channelWorker(() => {
      if (++calls === 1) throw new Error('no phonemizer')
      return provider()
    })
    const tts = workerTTS({ worker: create })
    await expect(tts.load!(() => {}, new AbortController().signal)).rejects.toThrow('no phonemizer')
    expect(workers[0]!.terminated).toBe(true)
    await tts.load!(() => {}, new AbortController().signal)
    expect(workers).toHaveLength(2)
    tts.terminate()
  })

  it('aborts in the worker and rejects right away', async () => {
    let workerSignal: AbortSignal | undefined
    const { create } = channelWorker(
      provider({
        synthesize: (_text, options) =>
          new Promise((_resolve, reject) => {
            workerSignal = options.signal
            options.signal!.addEventListener('abort', () => reject(new Error('stopped')))
          }),
      }),
    )
    const tts = workerTTS({ worker: create })
    const controller = new AbortController()
    const speech = tts.synthesize!('long sentence', { language: 'en', signal: controller.signal })
    await eventually(() => expect(workerSignal).toBeDefined())
    controller.abort()
    await expect(speech).rejects.toMatchObject({ name: 'AbortError' })
    await eventually(() => expect(workerSignal!.aborted).toBe(true))

    const aborted = new AbortController()
    aborted.abort()
    await expect(tts.load!(() => {}, aborted.signal)).rejects.toMatchObject({ name: 'AbortError' })
    tts.terminate()
  })

  it('rejects pending work when the worker fails to start, then retries with a new one', async () => {
    const { create, workers } = channelWorker(provider({ load: () => new Promise(() => {}) }))
    const tts = workerTTS({ worker: create })
    const loading = tts.load!(() => {}, new AbortController().signal)
    workers[0]!.fail('SyntaxError: Cannot use import statement outside a module')
    await expect(loading).rejects.toThrow('Speech worker failed: SyntaxError')
    expect(workers[0]!.terminated).toBe(true)
    expect(Array.from((await tts.synthesize!('ok', { language: 'en' })).samples)).toEqual([2, 0.5])
    expect(workers).toHaveLength(2)
    tts.terminate()
  })

  it('rejects when the worker cannot be created', async () => {
    const tts = workerTTS({
      worker: () => {
        throw new Error('blocked by CSP')
      },
    })
    await expect(tts.load!(() => {}, new AbortController().signal)).rejects.toThrow('blocked by CSP')
  })

  it('terminate rejects what is pending', async () => {
    const { create, workers } = channelWorker(provider({ synthesize: () => new Promise(() => {}) }))
    const tts = workerTTS({ worker: create })
    const speech = tts.synthesize!('x', { language: 'en' })
    tts.terminate()
    await expect(speech).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0]!.terminated).toBe(true)
  })

  it('is supported only with Worker and WebAssembly', () => {
    const tts = workerTTS({ worker: () => ({}) as TtsWorker })
    vi.stubGlobal('Worker', undefined)
    expect(tts.isSupported()).toBe(false)
    vi.stubGlobal('Worker', class {})
    expect(tts.isSupported()).toBe(true)
    vi.unstubAllGlobals()
  })

  it('ignores messages that are not for it, both ways', async () => {
    const { create, workers } = channelWorker(provider())
    const tts = workerTTS({ worker: create })
    await tts.load!(() => {}, new AbortController().signal)
    const [workerSide, pageSide] = workers[0]!.ports
    pageSide.postMessage({ type: 'load', id: 1 })
    pageSide.postMessage('app message')
    workerSide.postMessage({ type: 'error', error: { name: 'Error', message: 'not ours' } })
    expect(Array.from((await tts.synthesize!('abc', { language: 'en' })).samples)).toEqual([3, 0.5])
    expect(workers[0]!.terminated).toBe(false)
    tts.terminate()
  })

  it('traces each worker and request, with a number per worker', async () => {
    const { create } = channelWorker(provider())
    const tts = workerTTS({ worker: create })
    const events: Record<string, unknown>[] = []
    const off = tts.trace((event) => events.push(event))
    await tts.load!(() => {}, new AbortController().signal)
    await tts.synthesize!('olá', { language: 'pt-BR' })
    await eventually(() => expect(events.some((e) => e.event === 'worker.info')).toBe(true))
    const worker = events.find((e) => e.event === 'worker.created')!.worker
    expect(typeof worker).toBe('number')
    expect(events.every((e) => e.worker === worker)).toBe(true)
    const names = events.map((e) => e.event)
    expect(names.slice(0, 3)).toEqual(['worker.created', 'worker.init', 'request'])
    expect(names).toEqual(expect.arrayContaining(['worker.ready', 'worker.info', 'reply']))
    expect(events.filter((e) => e.event === 'worker.init').map((e) => e.attempt)).toEqual([1, 2])
    expect(events.find((e) => e.event === 'request' && e.type === 'synthesize')).toMatchObject({ chars: 3 })
    expect(events.filter((e) => e.event === 'reply').map((e) => e.type)).toEqual(['load', 'synthesize'])
    expect(JSON.stringify(events)).not.toContain('olá')

    tts.terminate()
    expect(events.at(-1)).toMatchObject({ event: 'worker.terminated', worker })
    off()
  })

  it('holds requests until the worker is listening, so a lost first init does no harm', async () => {
    // A worker whose first messages are lost, as WebKit can do while a module worker loads.
    let created: ReturnType<ReturnType<typeof channelWorker>['create']> | undefined
    const { create } = channelWorker(provider())
    const lossy = () => {
      const worker = create()
      created = worker
      let dropped = false
      const post = worker.postMessage
      worker.postMessage = (message, transfer) => {
        if (!dropped) {
          dropped = true
          return
        }
        post(message, transfer)
      }
      return worker
    }
    const tts = workerTTS({ worker: lossy })
    const events: Record<string, unknown>[] = []
    tts.trace((event) => events.push(event))
    const audio = await tts.synthesize!('abcd', { language: 'en' })
    expect(Array.from(audio.samples)).toEqual([4, 0.5])
    expect(created).toBeDefined()
    await eventually(() => expect(events.find((e) => e.event === 'worker.info')).toMatchObject({ inits: 1 }))
    expect(events.find((e) => e.event === 'worker.ready')).toMatchObject({ queued: 1 })
    tts.terminate()
  })

  it('says what was asked when the config never arrived', async () => {
    const { port1, port2 } = new MessageChannel()
    serveTTS(() => provider(), port1 as unknown as TtsWorkerScope)
    port1.start()
    port2.start()
    const replies: any[] = []
    port2.addEventListener('message', (event) => replies.push(event.data))
    port2.postMessage({ tag: 'h4b:tts', type: 'synthesize', id: 7, text: 'x', options: { language: 'en' } })
    await eventually(() => expect(replies.some((r) => r.type === 'error')).toBe(true))
    expect(replies[0]).toMatchObject({ type: 'ready' })
    expect(replies.find((r) => r.type === 'error').error.message).toBe(
      'serveTTS got a synthesize request before its config (no init reached this worker)',
    )
    port1.close()
  })

  it('removes a request aborted while it waits for the worker', async () => {
    const synthesize = vi.fn(async () => ({ samples: new Float32Array(1), sampleRate: 16000 }))
    const { create } = channelWorker(provider({ synthesize }))
    const tts = workerTTS({ worker: create })
    const controller = new AbortController()
    const speech = tts.synthesize!('x', { language: 'en', signal: controller.signal })
    controller.abort()
    await expect(speech).rejects.toMatchObject({ name: 'AbortError' })
    await tts.load!(() => {}, new AbortController().signal)
    expect(synthesize).not.toHaveBeenCalled()
    tts.terminate()
  })
})
