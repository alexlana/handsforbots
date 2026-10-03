import { SpeechError, type SpeechToText } from '../types.js'
import { capturePcm16, closeStream, openMicrophone } from './media.js'

export type StreamingResult = { partial?: string; final?: string; confidence?: number } | null | undefined

export type WebSocketSTTOptions = {
  name?: string
  /** WebSocket URL, or a function (e.g. fetch a short-lived token from your backend first). */
  url: string | ((language: string) => string | Promise<string>)
  /** PCM16 sample rate sent to the server. Default 16000. */
  sampleRate?: number
  /** Called when the socket opens (send config, auth…). */
  onOpen?(socket: WebSocket, options: { language: string; sampleRate: number }): void
  /** Maps a server message to partial/final text. */
  parse(data: string | ArrayBuffer): StreamingResult
  /** Tells the server the audio ended (e.g. send EOF). */
  finish?(socket: WebSocket): void
}

/** Streams PCM16 microphone audio over a WebSocket. Base for streaming cloud and self-hosted STT. */
export function websocketSTT(options: WebSocketSTTOptions): SpeechToText {
  const sampleRate = options.sampleRate ?? 16000
  return {
    name: options.name ?? 'websocket',
    capabilities: { partials: true, continuous: true, offline: false },
    isSupported: () =>
      typeof WebSocket !== 'undefined' && typeof AudioWorkletNode !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    async listen(listenOptions, handlers) {
      const url = typeof options.url === 'function' ? await options.url(listenOptions.language) : options.url
      const stream = await openMicrophone()
      const socket = new WebSocket(url)
      socket.binaryType = 'arraybuffer'
      let stopCapture: (() => Promise<void>) | undefined
      let ended = false
      let discarded = false

      const finish = async () => {
        if (ended) return
        ended = true
        await stopCapture?.()
        closeStream(stream)
        if (socket.readyState <= WebSocket.OPEN) socket.close()
        handlers.onEnd()
      }

      socket.onopen = async () => {
        options.onOpen?.(socket, { language: listenOptions.language, sampleRate })
        try {
          stopCapture = await capturePcm16(stream, sampleRate, (chunk) => {
            if (socket.readyState === WebSocket.OPEN) socket.send(chunk)
          })
        } catch (error) {
          handlers.onError(new SpeechError('audio-capture', (error as Error)?.message))
          void finish()
        }
      }
      socket.onmessage = (event) => {
        if (discarded) return
        const result = options.parse(event.data)
        if (result?.partial) handlers.onPartial?.(result.partial)
        if (result?.final?.trim()) {
          handlers.onFinal(result.final.trim(), { confidence: result.confidence })
          if (!listenOptions.continuous) void graceful()
        }
      }
      socket.onerror = () => handlers.onError(new SpeechError('network', `Speech server unreachable (${options.name ?? url})`))
      socket.onclose = () => void finish()

      // Stop sending audio, let the server flush the last result, then close.
      const graceful = async () => {
        await stopCapture?.()
        stopCapture = undefined
        if (socket.readyState === WebSocket.OPEN) options.finish?.(socket)
        setTimeout(() => void finish(), 1500)
      }

      return {
        stop: () => void graceful(),
        abort: () => {
          discarded = true
          void finish()
        },
      }
    },
  }
}

/** Self-hosted Vosk server (https://github.com/alphacep/vosk-server), as used by v1. */
export function voskSTT(options: { url: string; sampleRate?: number }): SpeechToText {
  return websocketSTT({
    name: 'vosk',
    url: options.url,
    sampleRate: options.sampleRate,
    onOpen: (socket, { sampleRate }) => socket.send(JSON.stringify({ config: { sample_rate: sampleRate } })),
    parse: (data) => {
      const json = JSON.parse(String(data))
      if (json.text !== undefined) return { final: json.text }
      if (json.partial) return { partial: json.partial }
      return null
    },
    finish: (socket) => socket.send('{"eof" : 1}'),
  })
}
