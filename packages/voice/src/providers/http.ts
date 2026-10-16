import {
  SpeechError,
  type ProsodySupport,
  type SpeakOptions,
  type SpeechAudio,
  type SpeechToText,
  type TextToSpeech,
} from '../types.js'
import { closeStream, detectEndOfSpeech, openMicrophone } from './media.js'

type Headers = Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)

const resolveHeaders = async (headers?: Headers) => (typeof headers === 'function' ? await headers() : (headers ?? {}))

export type HttpSTTOptions = {
  /** Your backend endpoint; it proxies the cloud provider so keys never reach the browser. */
  url: string
  headers?: Headers
  /** Reads the transcript from the JSON response. Default: `{ text, confidence? }`. */
  parse?: (json: any) => { text: string; confidence?: number }
  /** Silence that ends an utterance. Default 1200 ms. */
  silenceMs?: number
  fetch?: typeof fetch
  name?: string
}

/**
 * Records an utterance and POSTs it (multipart: `audio`, `language`) to your
 * backend. Works with any cloud STT (Whisper, Google, Azure…) behind a proxy.
 */
export function httpSTT(options: HttpSTTOptions): SpeechToText {
  const parse = options.parse ?? ((json) => ({ text: json.text ?? '', confidence: json.confidence }))
  return {
    name: options.name ?? 'http',
    capabilities: { partials: false, continuous: true, offline: false },
    remote: true,
    isSupported: () =>
      typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined',
    async listen(listenOptions, handlers) {
      const stream = await openMicrophone()
      let discarded = false
      let ended = false
      let continuous = listenOptions.continuous
      let stopVad = () => {}
      let recorder: MediaRecorder | undefined

      const finish = () => {
        if (ended) return
        ended = true
        stopVad()
        closeStream(stream)
        handlers.onEnd()
      }

      const record = () => {
        const chunks: Blob[] = []
        recorder = new MediaRecorder(stream)
        recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data)
        recorder.onstop = async () => {
          if (!discarded && chunks.length) {
            try {
              const body = new FormData()
              body.append('audio', new Blob(chunks, { type: recorder!.mimeType }), 'speech')
              body.append('language', listenOptions.language)
              const response = await (options.fetch ?? fetch)(options.url, {
                method: 'POST',
                body,
                headers: await resolveHeaders(options.headers),
              })
              if (!response.ok) throw new SpeechError('network', `STT endpoint responded ${response.status}`)
              const { text, confidence } = parse(await response.json())
              if (text?.trim()) handlers.onFinal(text.trim(), { confidence })
            } catch (error) {
              handlers.onError(error instanceof SpeechError ? error : new SpeechError('network', (error as Error)?.message))
            }
          }
          if (continuous && !discarded && !ended) record()
          else finish()
        }
        recorder.start()
      }

      stopVad = detectEndOfSpeech(stream, () => recorder?.state === 'recording' && recorder.stop(), {
        silenceMs: options.silenceMs,
      })
      record()

      return {
        stop() {
          continuous = false
          if (recorder?.state === 'recording') recorder.stop()
          else finish()
        },
        abort() {
          discarded = true
          if (recorder?.state === 'recording') recorder.stop()
          finish()
        },
      }
    },
  }
}

export type HttpTTSOptions = {
  /** Your backend endpoint: receives `{ text, language, voice, prosody? }`, returns audio (WAV, MP3, Ogg…). */
  url: string
  headers?: Headers
  fetch?: typeof fetch
  name?: string
  /**
   * The prosody your backend applies (for example as SSML, see `toSSML` in
   * `@handsforbots/voice-effects`). `true` = rate, pitch and volume. What it
   * does not apply, the player does where it can. Default: none, and the body
   * carries no `prosody`.
   */
  prosody?: boolean | ProsodySupport
  /** Builds the JSON body. Default `{ text, language, voice, prosody? }`. */
  body?: (text: string, options: SpeakOptions) => unknown
  /**
   * `webaudio` (default): the voice plugin plays the decoded audio, through the
   * effects. `element`: an `<audio>` element plays it, without effects.
   */
  playback?: 'webaudio' | 'element'
}

/** Decodes an audio file into mono samples (Web Audio). */
export async function decodeAudio(bytes: ArrayBuffer): Promise<SpeechAudio> {
  const decoder = new OfflineAudioContext(1, 1, 48000)
  const buffer = await decoder.decodeAudioData(bytes)
  const samples = new Float32Array(buffer.length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c)
    for (let i = 0; i < channel.length; i++) samples[i]! += channel[i]! / buffer.numberOfChannels
  }
  return { samples, sampleRate: buffer.sampleRate }
}

/** Cloud TTS through your backend; the voice plugin plays the returned audio. */
export function httpTTS(options: HttpTTSOptions): TextToSpeech {
  let current: HTMLAudioElement | undefined
  let finishCurrent: (() => void) | undefined
  const prosody: ProsodySupport | undefined =
    options.prosody === true ? { rate: true, pitch: true, volume: true } : options.prosody || undefined

  const request = async (text: string, speakOptions: SpeakOptions) => {
    const body = options.body?.(text, speakOptions) ?? {
      text,
      language: speakOptions.language,
      voice: speakOptions.voice,
      ...(prosody && speakOptions.prosody && Object.keys(speakOptions.prosody).length ? { prosody: speakOptions.prosody } : {}),
    }
    const response = await (options.fetch ?? fetch)(options.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await resolveHeaders(options.headers)) },
      body: JSON.stringify(body),
      signal: speakOptions.signal,
    })
    if (!response.ok) throw new SpeechError('network', `TTS endpoint responded ${response.status}`)
    return response
  }

  return {
    name: options.name ?? 'http',
    remote: true,
    prosody,
    isSupported: () => typeof Audio !== 'undefined' || typeof OfflineAudioContext !== 'undefined',
    synthesize:
      options.playback === 'element'
        ? undefined
        : async (text, speakOptions) => decodeAudio(await (await request(text, speakOptions)).arrayBuffer()),
    async speak(text, speakOptions) {
      const response = await request(text, speakOptions)
      const url = URL.createObjectURL(await response.blob())
      try {
        await new Promise<void>((resolve) => {
          const audio = new Audio(url)
          current = audio
          finishCurrent = resolve
          audio.onended = () => resolve()
          audio.onerror = () => resolve()
          speakOptions.signal?.addEventListener('abort', () => resolve(), { once: true })
          audio.play().catch(() => resolve())
        })
      } finally {
        current?.pause()
        current = undefined
        finishCurrent = undefined
        URL.revokeObjectURL(url)
      }
    },
    cancel() {
      current?.pause()
      finishCurrent?.()
    },
  }
}
