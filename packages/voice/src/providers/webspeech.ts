import { SpeechError, type SpeechErrorCode, type SpeechToText, type TextToSpeech } from '../types.js'

type RecognitionCtor = new () => any

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const ERROR_CODES: Record<string, SpeechErrorCode> = {
  'not-allowed': 'not-allowed',
  'service-not-allowed': 'not-allowed',
  'no-speech': 'no-speech',
  'audio-capture': 'audio-capture',
  network: 'network',
  aborted: 'aborted',
  'language-not-supported': 'not-supported',
}

/** Browser speech recognition (Web Speech API). Quality and privacy depend on the browser vendor. */
export function webSpeechSTT(): SpeechToText {
  return {
    name: 'webspeech',
    capabilities: { partials: true, continuous: true, offline: false },
    isSupported: () => recognitionCtor() !== undefined,
    listen(options, handlers) {
      const Ctor = recognitionCtor()
      if (!Ctor) throw new SpeechError('not-supported', 'Web Speech recognition is not available')
      const recognition = new Ctor()
      recognition.lang = options.language
      recognition.continuous = options.continuous
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
    async speak(text, speakOptions) {
      const s = synth()
      if (!s) throw new SpeechError('not-supported', 'Speech synthesis is not available')
      const voice = await pickVoice(speakOptions.language, speakOptions.voice)
      for (const sentence of splitSentences(text)) {
        if (speakOptions.signal?.aborted) return
        await new Promise<void>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(sentence)
          utterance.lang = speakOptions.language
          if (voice) utterance.voice = voice
          if (options.rate) utterance.rate = options.rate
          if (options.pitch) utterance.pitch = options.pitch
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
