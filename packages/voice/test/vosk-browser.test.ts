// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

const audio = vi.hoisted(() => ({ onFrame: undefined as undefined | ((f: Float32Array, rate: number) => void), stopped: 0, closed: 0 }))
vi.mock('../src/providers/media.js', () => ({
  openMicrophone: async () => ({ getTracks: () => [] }),
  closeStream: () => void audio.closed++,
  captureFloat: async (_stream: unknown, onFrame: (f: Float32Array, rate: number) => void) => {
    audio.onFrame = onFrame
    return async () => void audio.stopped++
  },
}))

const { voskBrowserSTT } = await import('../src/providers/vosk-browser.js')

function fakeVosk() {
  const recognizers: any[] = []
  const createModel = vi.fn(async () => ({
    terminate: vi.fn(),
    KaldiRecognizer: class {
      listeners: Record<string, (m: any) => void> = {}
      frames = 0
      args: unknown[]
      constructor(...args: unknown[]) {
        this.args = args
        recognizers.push(this)
      }
      on(event: string, listener: (m: any) => void) {
        this.listeners[event] = listener
      }
      acceptWaveformFloat() {
        this.frames++
      }
      retrieveFinalResult() {
        this.listeners.result?.({ result: { text: 'última frase', result: [{ conf: 0.9 }] } })
      }
      remove = vi.fn()
    },
  }))
  return { load: async () => ({ createModel }), createModel, recognizers }
}

const handlers = () => ({ onPartial: vi.fn(), onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() })

describe('voskBrowserSTT (offline)', () => {
  it('loads the model once and streams partials and finals', async () => {
    const vosk = fakeVosk()
    const stt = voskBrowserSTT({ modelUrl: '/models/pt.tar.gz', load: vosk.load })
    await stt.preload()
    const h = handlers()
    const session = await stt.listen({ language: 'pt-BR', continuous: true }, h)
    audio.onFrame!(new Float32Array(128), 48000)
    const recognizer = vosk.recognizers[0]
    expect(recognizer.args).toEqual([48000])
    recognizer.listeners.partialresult({ result: { partial: 'mostra os' } })
    recognizer.listeners.result({ result: { text: 'mostra os pedidos', result: [{ conf: 1 }, { conf: 0.8 }] } })
    expect(h.onPartial).toHaveBeenCalledWith('mostra os')
    expect(h.onFinal).toHaveBeenCalledWith('mostra os pedidos', { confidence: 0.9 })

    vi.useFakeTimers()
    session.stop()
    await vi.advanceTimersByTimeAsync(900)
    vi.useRealTimers()
    expect(h.onFinal).toHaveBeenLastCalledWith('última frase', { confidence: 0.9 })
    expect(h.onEnd).toHaveBeenCalledOnce()
    expect(recognizer.remove).toHaveBeenCalled()

    await stt.listen({ language: 'pt-BR', continuous: false }, handlers())
    expect(vosk.createModel).toHaveBeenCalledOnce()
  })

  it('supports a command grammar, stops after one utterance when not continuous, and reports load failures', async () => {
    const vosk = fakeVosk()
    const stt = voskBrowserSTT({ modelUrl: '/m', load: vosk.load, grammar: '["próximo", "voltar"]' })
    const h = handlers()
    await stt.listen({ language: 'pt-BR', continuous: false }, h)
    audio.onFrame!(new Float32Array(1), 16000)
    expect(vosk.recognizers[0].args).toEqual([16000, '["próximo", "voltar"]'])
    vosk.recognizers[0].listeners.result({ result: { text: 'próximo' } })
    await new Promise((r) => setTimeout(r, 0))
    expect(h.onEnd).toHaveBeenCalledOnce()

    const broken = voskBrowserSTT({ modelUrl: '/x', load: async () => ({ createModel: async () => { throw new Error('404') } }) })
    await expect(broken.listen({ language: 'pt', continuous: true }, handlers())).rejects.toMatchObject({ code: 'network' })
    // A later attempt retries the download.
    await expect(broken.preload()).rejects.toThrow('404')
  })

  it('abort discards pending results', async () => {
    const vosk = fakeVosk()
    const stt = voskBrowserSTT({ modelUrl: '/m', load: vosk.load })
    const h = handlers()
    const session = await stt.listen({ language: 'pt', continuous: true }, h)
    audio.onFrame!(new Float32Array(1), 16000)
    session.abort()
    vosk.recognizers[0].listeners.result({ result: { text: 'tarde demais' } })
    expect(h.onFinal).not.toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 0))
    expect(h.onEnd).toHaveBeenCalledOnce()
  })
})
