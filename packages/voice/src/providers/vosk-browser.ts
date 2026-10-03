import { SpeechError, type SpeechToText } from '../types.js'
import { captureFloat, closeStream, openMicrophone } from './media.js'

/** The parts of the `vosk-browser` module this provider uses. */
export type VoskBrowserModule = {
  createModel(modelUrl: string, logLevel?: number): Promise<VoskModel>
}
type VoskRecognizer = {
  on(event: 'result' | 'partialresult' | 'error', listener: (message: any) => void): void
  acceptWaveformFloat(buffer: Float32Array, sampleRate: number): void
  retrieveFinalResult(): void
  remove(): void
}
type VoskModel = {
  KaldiRecognizer: new (sampleRate: number, grammar?: string) => VoskRecognizer
  terminate(): void
}

export type VoskBrowserOptions = {
  /** URL of a Vosk model archive (e.g. vosk-model-small-pt-0.3.tar.gz) served by your site or a CDN. */
  modelUrl: string
  /** Loads the optional dependency: `() => import('vosk-browser')`. */
  load: () => Promise<VoskBrowserModule>
  /** Restrict recognition to a word list (JSON array as a string), e.g. for commands. */
  grammar?: string
}

/**
 * Offline speech recognition in the browser (WebAssembly). The model is
 * downloaded once (tens of MB) and kept in memory; after that no audio leaves
 * the device.
 */
export function voskBrowserSTT(options: VoskBrowserOptions): SpeechToText & { preload(): Promise<void> } {
  let model: Promise<VoskModel> | undefined
  const loadModel = () => {
    model ??= options
      .load()
      .then((mod) => mod.createModel(options.modelUrl))
      .catch((error) => {
        model = undefined
        throw new SpeechError('network', `Could not load the Vosk model: ${(error as Error)?.message ?? error}`)
      })
    return model
  }

  return {
    name: 'vosk-browser',
    capabilities: { partials: true, continuous: true, offline: true },
    isSupported: () =>
      typeof WebAssembly === 'object' && typeof AudioWorkletNode !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    preload: async () => void (await loadModel()),
    async listen(listenOptions, handlers) {
      const loaded = await loadModel()
      const stream = await openMicrophone()
      let recognizer: VoskRecognizer | undefined
      let stopCapture: (() => Promise<void>) | undefined
      let ended = false
      let discarded = false

      const finish = async () => {
        if (ended) return
        ended = true
        await stopCapture?.()
        closeStream(stream)
        recognizer?.remove()
        handlers.onEnd()
      }

      stopCapture = await captureFloat(stream, (frame, sampleRate) => {
        if (!recognizer) {
          recognizer = options.grammar ? new loaded.KaldiRecognizer(sampleRate, options.grammar) : new loaded.KaldiRecognizer(sampleRate)
          recognizer.on('partialresult', (message) => {
            const partial = message?.result?.partial
            if (partial && !discarded) handlers.onPartial?.(partial)
          })
          recognizer.on('result', (message) => {
            const text = String(message?.result?.text ?? '').trim()
            if (!text || discarded) return
            const words = message.result.result as { conf: number }[] | undefined
            const confidence = words?.length ? words.reduce((sum, w) => sum + w.conf, 0) / words.length : undefined
            handlers.onFinal(text, { confidence })
            if (!listenOptions.continuous) void finish()
          })
          recognizer.on('error', (message) => handlers.onError(new SpeechError('unknown', String(message?.error ?? 'Vosk error'))))
        }
        recognizer.acceptWaveformFloat(frame, sampleRate)
      })

      return {
        stop() {
          // Flush the last utterance, then end shortly after.
          void stopCapture?.().then(() => {
            stopCapture = undefined
            recognizer?.retrieveFinalResult()
            setTimeout(() => void finish(), 800)
          })
        },
        abort() {
          discarded = true
          void finish()
        },
      }
    },
  }
}
