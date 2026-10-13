export type SttCapabilities = {
  /** Emits partial transcripts while the user speaks. */
  partials?: boolean
  /** Works without network. */
  offline?: boolean
  /** Can keep listening across utterances (hands-free). */
  continuous?: boolean
  /** Marks final results with `endOfTurn` (the service detects the end of the turn itself). */
  endOfTurn?: boolean
  /** Delivers the microphone audio through `onAudio` (for audio end-of-turn models). */
  audio?: boolean
}

export type SttListenOptions = {
  language: string
  /** Keep listening after an utterance ends (hands-free). */
  continuous: boolean
}

export type SttHandlers = {
  onPartial?(text: string): void
  /**
   * `endOfTurn`: providers with `capabilities.endOfTurn` say whether the user
   * finished the turn (true) or only paused (false).
   */
  onFinal(text: string, meta?: { confidence?: number; endOfTurn?: boolean }): void
  /** Raw microphone audio, mono, from providers with `capabilities.audio`. */
  onAudio?(samples: Float32Array, sampleRate: number): void
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
  /** Audio or text leaves the page (cloud service, or the browser's own speech service). */
  remote?: boolean
  /** Consent purpose required to use it (ADR 0010); skipped while not granted. */
  consent?: string
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
  remote?: boolean
  consent?: string
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

/** A turn of the recent conversation, as end-of-turn models see it. */
export type TurnHistoryEntry = { role: 'user' | 'assistant'; text: string }

export type EndOfTurnInput = {
  /** What the user said so far in this turn. */
  partial: string
  /** Recent turns, oldest first, at most `historyTurns`. */
  history: TurnHistoryEntry[]
  language: string
  /** The last seconds of microphone audio (only for `input: 'audio'`). */
  audio?: { samples: Float32Array; sampleRate: number }
}

/**
 * Decides whether the user finished speaking or only paused (ADR 0011): a
 * text classifier (LiveKit turn-detector, a BERT model, a typed-decision model,
 * the backend's LLM) or an audio one (Pipecat Smart Turn). Returns the
 * probability that the turn is over; the voice plugin turns it into a wait.
 */
export type EndOfTurn = {
  name: string
  input: 'text' | 'audio'
  /** How many recent turns `predict` gets. Default 6. */
  historyTurns?: number
  /** The text or audio leaves the page. */
  remote?: boolean
  /** Consent purpose required to use it (ADR 0010); silence only while not granted. */
  consent?: string
  isSupported(): boolean | Promise<boolean>
  /** Loads a model on demand; the plugin uses silence alone until it resolves. */
  load?(): Promise<void>
  predict(input: EndOfTurnInput, signal: AbortSignal): number | Promise<number>
}

/** A sentence the bot spoke (or is speaking), as echo filters see it. */
export type SpokenSentence = {
  text: string
  /** When the speech started (epoch ms). */
  startedAt: number
  /** When it ended; absent while it is still being spoken. */
  endedAt?: number
}

export type EchoInput = {
  /** What the recognizer heard. */
  text: string
  /** A final result (true) or a live transcript (false). */
  final: boolean
  /** What the bot said recently, oldest first: the sentence being spoken and those that ended within `tail`. Never empty. */
  speech: SpokenSentence[]
  language: string
}

/**
 * Removes the bot's own voice from what the microphone heard: with speakers,
 * the reply comes back through the recognizer and would interrupt or answer the
 * bot. The voice plugin asks it while the bot speaks and for `tail` ms after,
 * for every live transcript and final result, before barge-in and the turn see
 * them. Must be synchronous: it runs on every partial.
 */
export type EchoFilter = {
  name: string
  /** How long after a sentence ends it is still passed in `speech` (ms). Default 2000. */
  tail?: number
  /** Returns what the user said: `text` itself, a shorter text, or '' when it was all echo. */
  filter(input: EchoInput): string
}
