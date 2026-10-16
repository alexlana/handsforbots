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

/**
 * How to say it, after SSML `<prosody>` (W3C SSML 1.1, section 3.2.4), with
 * relative values only. Absent = the voice's own.
 */
export type Prosody = {
  /** Speaking rate as a multiplier (SSML `rate="120%"` = 1.2): tempo without a pitch change. */
  rate?: number
  /** Pitch shift in semitones (SSML `pitch="+2st"` = 2). */
  pitch?: number
  /** Volume change in decibels (SSML `volume="+6dB"` = 6). */
  volume?: number
}

/** Which parts of the prosody a provider applies itself. */
export type ProsodySupport = { rate?: boolean; pitch?: boolean; volume?: boolean }

export type SpeakOptions = {
  language: string
  voice?: string
  signal?: AbortSignal
  /** The part of the prosody this provider applies itself (see `TextToSpeech.prosody`). */
  prosody?: Prosody
}

/** Mono audio made by a synthesizer, before it is played. */
export type SpeechAudio = {
  samples: Float32Array
  sampleRate: number
}

/** Download progress of a provider's model, in bytes. */
export type LoadProgress = {
  loaded: number
  /** Unknown until the server tells it (no `Content-Length`). */
  total?: number
  /** The file being downloaded. */
  file?: string
}

/**
 * Text-to-speech provider: the browser's voice, a cloud service behind your
 * backend or a model running in the page. A provider either plays the speech
 * itself (`speak`) or hands the audio to the voice plugin (`synthesize`), which
 * plays it through the effects; at least one of the two is required.
 */
export type TextToSpeech = {
  name: string
  remote?: boolean
  consent?: string
  isSupported(): boolean | Promise<boolean>
  /** Plays the speech itself; resolves when it finishes or is cancelled. */
  speak?(text: string, options: SpeakOptions): Promise<void>
  /** Returns the audio without playing it. Preferred over `speak` when Web Audio is available. */
  synthesize?(text: string, options: SpeakOptions): Promise<SpeechAudio>
  /** Stops what `speak` is playing. */
  cancel?(): void
  /**
   * Downloads and prepares what it needs (a model). The voice plugin decides
   * when to call it (`load.start`) and what to do with speech meanwhile
   * (`load.whileLoading`). Without it, the provider is ready once supported.
   */
  load?(onProgress: (progress: LoadProgress) => void, signal: AbortSignal): Promise<void>
  /** Bytes `load` downloads, if known in advance (for the UI). */
  size?: number
  /** Prosody it applies itself; the player does the rest it can (pitch, volume). */
  prosody?: ProsodySupport
}

/** One sentence's effects, built by `SpeechEffects.connect`. */
export type EffectsInstance = {
  /** The node that goes to the speakers. */
  output: AudioNode
  /** Seconds the effects keep sounding after the speech ends (reverb, echo). */
  tail?: number
  /** Releases the nodes (oscillators, buffers) once the tail is over or speech stops. */
  dispose?(): void
}

/**
 * Effects on synthesized speech. The voice plugin asks `prosody()` before each
 * sentence (providers apply what they can; `speechSynthesis` gets only this),
 * runs `process` on the samples and plays them through `connect`.
 */
export type SpeechEffects = {
  name: string
  prosody?(): Prosody
  /** Sample-level processing before playback (a noise gate, for example). */
  process?(audio: SpeechAudio): SpeechAudio
  /** Wires the effects after `source`; may change `source.playbackRate`. */
  connect(context: BaseAudioContext, source: AudioBufferSourceNode): EffectsInstance
  /** Called when the effects change (so `state.effects` follows `name`). */
  subscribe?(listener: () => void): () => void
}

export type PlayOptions = {
  effects?: SpeechEffects
  /** Playback rate of the source (changes pitch and tempo together). */
  playbackRate?: number
  /** Gain in decibels. */
  gainDb?: number
  signal?: AbortSignal
}

/** Plays synthesized speech. `webAudioPlayer()` is the default. */
export type AudioPlayer = {
  isSupported(): boolean
  /** Creates or resumes the audio output; Safari and Firefox only allow it inside a user gesture. */
  unlock(): void
  /** Resolves when the speech ends or `signal` aborts; effect tails keep sounding after it. */
  play(audio: SpeechAudio, options: PlayOptions): Promise<void>
  /** Stops everything, tails included. */
  stop(): void
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
