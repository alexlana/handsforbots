import { SpeechError, type Prosody, type SpeechErrorCode, type SpeechToText, type TextToSpeech } from '../types.js'

type RecognitionCtor = new () => any

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const ERROR_CODES: Record<string, SpeechErrorCode> = {
  'not-allowed': 'not-allowed',
  'service-not-allowed': 'service-not-allowed',
  'no-speech': 'no-speech',
  'audio-capture': 'audio-capture',
  network: 'network',
  aborted: 'aborted',
  'language-not-supported': 'not-supported',
}

const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent ?? '')

export type WebSpeechSTTOptions = {
  /**
   * Whether to use the browser's own continuous recognition when the voice
   * service asks to keep listening (hold-to-talk, hands-free). `auto`
   * (default): yes, except on Android, where Chrome repeats what was already
   * said in that mode; there each session hears one utterance and the voice
   * service starts the next one. `false` does that everywhere.
   */
  continuous?: 'auto' | boolean
}

/** Browser speech recognition (Web Speech API). Quality and privacy depend on the browser vendor. */
export function webSpeechSTT(sttOptions: WebSpeechSTTOptions = {}): SpeechToText {
  const mode = sttOptions.continuous ?? 'auto'
  const nativeContinuous = () => (mode === 'auto' ? !isAndroid() : mode)
  return {
    name: 'webspeech',
    capabilities: { partials: true, continuous: nativeContinuous(), offline: false },
    // Browsers such as Chrome send the audio to their speech service.
    remote: true,
    // Outside a secure context the API exists but every session fails as a denied permission.
    isSupported: () => recognitionCtor() !== undefined && window.isSecureContext !== false,
    listen(options, handlers) {
      const Ctor = recognitionCtor()
      if (!Ctor) throw new SpeechError('not-supported', 'Web Speech recognition is not available')
      const recognition = new Ctor()
      recognition.lang = options.language
      recognition.continuous = options.continuous && nativeContinuous()
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      recognition.onresult = (event: any) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const alternative = result[0]
          if (result.isFinal) {
            const text = String(alternative.transcript ?? '').trim()
            if (text) handlers.onFinal(text, { confidence: alternative.confidence })
          } else {
            interim += alternative.transcript
          }
        }
        if (interim) handlers.onPartial?.(interim.trim())
      }
      recognition.onerror = (event: any) => {
        const code = ERROR_CODES[event.error] ?? 'unknown'
        if (code !== 'aborted') handlers.onError(new SpeechError(code, event.message || event.error))
      }
      recognition.onend = () => handlers.onEnd()
      recognition.start()

      return {
        stop: () => recognition.stop(),
        abort: () => recognition.abort(),
      }
    },
  }
}

export type WebSpeechTTSOptions = {
  /** Voice name, or a predicate over available voices. */
  voice?: string | ((voice: SpeechSynthesisVoice) => boolean)
  rate?: number
  pitch?: number
}

/** Browser speech synthesis. */
export function webSpeechTTS(options: WebSpeechTTSOptions = {}): TextToSpeech {
  const synth = () => (typeof window !== 'undefined' ? window.speechSynthesis : undefined)

  const voices = async (): Promise<SpeechSynthesisVoice[]> => {
    const s = synth()
    if (!s) return []
    const list = s.getVoices()
    if (list.length) return list
    // Voices load asynchronously in some browsers.
    return new Promise((resolve) => {
      const done = () => resolve(s.getVoices())
      s.addEventListener?.('voiceschanged', done, { once: true })
      setTimeout(done, 800)
    })
  }

  const pickVoice = async (language: string, name?: string) => {
    const list = await voices()
    const wanted = name ?? options.voice
    if (typeof wanted === 'function') return list.find(wanted)
    if (wanted) return list.find((v) => v.name === wanted)
    const lang = language.toLowerCase().replace('_', '-')
    return (
      list.find((v) => v.lang.toLowerCase().replace('_', '-') === lang) ??
      list.find((v) => v.lang.toLowerCase().startsWith(lang.split('-')[0]!))
    )
  }

  return {
    name: 'webspeech',
    isSupported: () => synth() !== undefined && typeof SpeechSynthesisUtterance !== 'undefined',
    // The browser's audio cannot go through Web Audio: effects reach it only as prosody.
    prosody: { rate: true, pitch: true, volume: true },
    async speak(text, speakOptions) {
      const s = synth()
      if (!s) throw new SpeechError('not-supported', 'Speech synthesis is not available')
      const voice = await pickVoice(speakOptions.language, speakOptions.voice)
      const { rate, pitch, volume } = utteranceProsody(options, speakOptions.prosody)
      for (const sentence of splitSentences(text)) {
        if (speakOptions.signal?.aborted) return
        await new Promise<void>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(sentence)
          utterance.lang = speakOptions.language
          if (voice) utterance.voice = voice
          if (rate !== 1) utterance.rate = rate
          if (pitch !== 1) utterance.pitch = pitch
          if (volume !== 1) utterance.volume = volume
          utterance.onend = () => resolve()
          utterance.onerror = () => resolve()
          speakOptions.signal?.addEventListener('abort', () => resolve(), { once: true })
          s.speak(utterance)
        })
      }
    },
    cancel: () => synth()?.cancel(),
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Utterance values for the options and the prosody: `rate` 0.1–10, `pitch`
 * 0–2 (1 = the voice's, semitones become a frequency ratio), `volume` 0–1
 * (decibels become a gain, so it can only go down from the default).
 */
export function utteranceProsody(options: WebSpeechTTSOptions, prosody: Prosody = {}) {
  return {
    rate: clamp((options.rate ?? 1) * (prosody.rate ?? 1), 0.1, 10),
    pitch: clamp((options.pitch ?? 1) * 2 ** ((prosody.pitch ?? 0) / 12), 0, 2),
    volume: clamp(10 ** ((prosody.volume ?? 0) / 20), 0, 1),
  }
}

/** Splits long text into sentence-sized chunks (Chrome cuts long utterances). */
export function splitSentences(text: string, max = 220): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*\s*/g) ?? []
  const chunks: string[] = []
  for (const sentence of sentences) {
    const last = chunks[chunks.length - 1]
    if (last && last.length + sentence.length <= max) chunks[chunks.length - 1] = last + sentence
    else chunks.push(sentence)
  }
  return chunks.map((c) => c.trim()).filter(Boolean)
}
