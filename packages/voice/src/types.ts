export type SttCapabilities = {
  /** Emits partial transcripts while the user speaks. */
  partials?: boolean
  /** Works without network. */
  offline?: boolean
  /** Can keep listening across utterances (hands-free). */
  continuous?: boolean
}

export type SttListenOptions = {
  language: string
  /** Keep listening after an utterance ends (hands-free). */
  continuous: boolean
}

export type SttHandlers = {
  onPartial?(text: string): void
  onFinal(text: string, meta?: { confidence?: number }): void
  onError(error: SpeechError): void
  /** The session ended (stop, silence, error or provider limit). */
  onEnd(): void
}

export type SttSession = {
  /** Stop listening and flush the last result. */
  stop(): void
  /** Stop immediately, discarding pending results. */
  abort(): void
}

/** Speech-to-text provider: browser, local model or cloud. */
export type SpeechToText = {
  name: string
  capabilities: SttCapabilities
  isSupported(): boolean | Promise<boolean>
  listen(options: SttListenOptions, handlers: SttHandlers): SttSession | Promise<SttSession>
}

export type SpeakOptions = {
  language: string
  voice?: string
  signal?: AbortSignal
}

/** Text-to-speech provider: browser or cloud. */
export type TextToSpeech = {
  name: string
  isSupported(): boolean | Promise<boolean>
  /** Resolves when speech finishes or is cancelled. */
  speak(text: string, options: SpeakOptions): Promise<void>
  cancel(): void
}

export type SpeechErrorCode =
  | 'not-supported'
  /** The user or the page denied the microphone. */
  | 'not-allowed'
  /** The microphone is fine, but the browser's speech service is off or blocked (e.g. dictation disabled in Safari). */
  | 'service-not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'unknown'

export class SpeechError extends Error {
  constructor(
    readonly code: SpeechErrorCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'SpeechError'
  }

  /** Errors where trying the next provider makes sense. */
  get recoverable(): boolean {
    return (
      this.code === 'network' ||
      this.code === 'not-supported' ||
      this.code === 'audio-capture' ||
      this.code === 'service-not-allowed'
    )
  }
}
