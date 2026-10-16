import { definePlugin, textOf, type AssistantMessage, type PluginContext } from '@handsforbots/core'
import { planProsody, webAudioPlayer, type ProsodyPlan } from './player.js'
import { textEchoFilter } from './providers/echo.js'
import {
  SpeechError,
  type AudioPlayer,
  type EchoFilter,
  type EndOfTurn,
  type SpeakOptions,
  type SpeechAudio,
  type SpeechEffects,
  type SpeechToText,
  type SpokenSentence,
  type SttSession,
  type TextToSpeech,
  type TurnHistoryEntry,
} from './types.js'

export type VoiceMode = 'push-to-talk' | 'hands-free'
export type InputModality = 'keyboard' | 'voice'
/** `auto`: answer with voice when the user spoke, with text when they typed. */
export type OutputPreference = 'auto' | 'voice' | 'text'
/** What the conversation is doing, for UIs to draw (ADR 0011). */
export type VoicePhase = 'idle' | 'listening' | 'userSpeaking' | 'waitingEndOfTurn' | 'botSpeaking'

/** Where a speech provider is: providers without `load` are `ready` from the start. */
export type TtsStatus = {
  state: 'unloaded' | 'loading' | 'ready' | 'failed'
  /** Bytes downloaded so far. */
  loaded?: number
  total?: number
  error?: string
}

/**
 * When providers with a model (`load`) start downloading. `eager`: when the
 * plugin starts. `idle`: once the page is idle after that. `first-use`
 * (default): when a reply is first spoken. `manual`: only on `loadSpeech()`.
 */
export type SpeechLoadStart = 'eager' | 'idle' | 'first-use' | 'manual'

/**
 * Speech while the preferred provider is not ready. `fallback` (default): the
 * next ready provider in the list speaks (the browser's voice, for instance).
 * `wait`: speech waits for the download in progress. `silent`: replies are
 * not spoken until it is ready.
 */
export type SpeechWhileLoading = 'fallback' | 'wait' | 'silent'

export type SpeechLoading = { start?: SpeechLoadStart; whileLoading?: SpeechWhileLoading }

export type VoiceState = {
  supported: { stt: boolean; tts: boolean }
  mode: VoiceMode
  phase: VoicePhase
  listening: boolean
  speaking: boolean
  /** Live transcript while the user speaks (hands-free: the whole pending turn). */
  partial: string
  /** When the pending hands-free turn will be sent if the user stays quiet (epoch ms). */
  endOfTurnAt?: number
  /** The user talked over the last reply and cut it short. Cleared when the next reply starts. */
  interrupted: boolean
  /** Modality of the user's last trigger. */
  lastInput: InputModality
  output: OutputPreference
  /** Active providers. */
  stt?: string
  tts?: string
  /** Each speech provider by name: whether its model is downloaded, and how much of it. */
  ttsStatus: Record<string, TtsStatus>
  /** A sentence is being synthesized (models can take seconds before speech starts). */
  synthesizing: boolean
  /** End-of-turn provider in use, if any. */
  endOfTurn?: string
  /** Echo filter in use, if any. */
  echo?: string
  /** Speech effects in use, if any. */
  effects?: string
  error?: SpeechError
}

export type ListenOptions = {
  /**
   * When a push-to-talk utterance ends. `silence` (default): the first pause
   * sends it. `stop`: keep listening across pauses and send everything said,
   * as one message, when `stop()` is called (hold-to-talk). Hands-free mode
   * ignores it.
   */
  until?: 'silence' | 'stop'
}

/** How long hands-free waits before sending what the user said (ms). */
export type TurnTiming = {
  /** Without an end-of-turn provider (or when it fails): wait this long after the last words. Default 800. */
  silence?: number
  /** With a provider: ask it after this pause. Default 300. */
  minSilence?: number
  /** With a provider that says "not finished": send anyway after this pause. Default 2000. */
  maxSilence?: number
  /** Probability from which the provider's answer counts as "finished". Default 0.5. */
  threshold?: number
  /** Longest wait for the provider's answer; past it, silence decides. Default 600. */
  timeout?: number
  /** Seconds of audio kept for audio providers. Default 8. */
  audioSeconds?: number
}

export type BargeInOptions = {
  /** Words a live transcript needs before it interrupts (a final result always can). Default 2. */
  minWords?: number
  /** Backchannels that never interrupt ("aham", "ok"…). Default: a list for the language. */
  ignore?: string[]
}

export type VoiceDecision =
  | { kind: 'interrupt'; text: string }
  | { kind: 'ignore'; text: string; reason: 'backchannel' | 'too-short' | 'echo' }
  | { kind: 'end-of-turn'; text: string; reason: 'stt' | 'model' | 'silence' | 'max-silence' | 'manual'; probability?: number }
  | { kind: 'end-of-turn-unavailable'; provider: string; reason: string }

export type VoiceService = {
  getState(): VoiceState
  subscribe(listener: () => void): () => void
  /** Start listening (push-to-talk press, mic button, hands-free on). */
  listen(options?: ListenOptions): Promise<void>
  /** Stop listening; the current utterance is still transcribed and sent. */
  stop(): void
  /** Stop listening and discard the current utterance: nothing is sent. */
  cancel(): void
  /** Hands-free: send the pending turn now, without waiting for the silence. */
  endTurn(): void
  /** Hands-free: discard the pending turn and keep listening. */
  discardTurn(): void
  toggle(): Promise<void>
  setMode(mode: VoiceMode): void
  setOutput(output: OutputPreference): void
  /** Turns the end-of-turn model on (a provider) or off (`null`: silence only). */
  setEndOfTurn(provider: EndOfTurn | null): void
  /** Replaces the echo filter, or turns it off (`null`). */
  setEcho(filter: EchoFilter | null): void
  /** Changes timings and barge-in at runtime. */
  configure(options: { turn?: TurnTiming; bargeIn?: boolean | BargeInOptions }): void
  speak(text: string): Promise<void>
  cancelSpeech(): void
  /**
   * Starts downloading a provider's model now (by name; default: the preferred
   * one). Resolves `true` when it is ready, `false` if it failed (the error is
   * in `ttsStatus` and on the `error` event). Calling it again after a failure retries.
   */
  loadSpeech(name?: string): Promise<boolean>
  /** Replaces the speech providers (the user picked another voice or model). */
  setTTS(tts: TextToSpeech | TextToSpeech[]): Promise<void>
  /** Replaces the speech effects, or turns them off (`null`). */
  setEffects(effects: SpeechEffects | null): void
  /** Allows audio playback: call it inside a click if speech may start long after it. */
  unlockAudio(): void
}

declare module '@handsforbots/core' {
  interface Services {
    voice: VoiceService
  }
  interface Events {
    /** Why the voice interrupted, ignored or ended a turn (for logs and debugging). */
    'voice.decision': VoiceDecision
  }
}

export type VoiceOptions = {
  /** Providers in order of preference; the next is tried when one is unsupported or fails. */
  stt?: SpeechToText | SpeechToText[]
  tts?: TextToSpeech | TextToSpeech[]
  /** BCP 47, e.g. 'pt-BR'. Default: the document language or 'en-US'. */
  language?: string
  mode?: VoiceMode
  output?: OutputPreference
  /**
   * Talking over the bot interrupts it: the speech stops, the reply is
   * cancelled and cut where it was heard. Default true.
   */
  bargeIn?: boolean | BargeInOptions
  /** Hands-free: decides whether a pause ends the turn. Without it, silence alone does. */
  endOfTurn?: EndOfTurn | null
  /**
   * Drops what the microphone hears of the bot's own speech, so it neither
   * interrupts nor answers itself. Default `textEchoFilter()`; `false` turns it
   * off; pass your own `EchoFilter` to replace it.
   */
  echo?: EchoFilter | false
  turn?: TurnTiming
  voiceName?: string
  /** When models download and what speech does meanwhile. Default `{ start: 'first-use', whileLoading: 'fallback' }`. */
  load?: SpeechLoading
  /** Effects on synthesized speech; `speechSynthesis` only gets their prosody. */
  effects?: SpeechEffects | null
  /** Plays synthesized speech. Default `webAudioPlayer()`. */
  player?: AudioPlayer
}

const toArray = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value])

const BACKCHANNELS: Record<string, string[]> = {
  pt: ['aham', 'uhum', 'hum', 'hm', 'hmm', 'ah', 'ahn', 'é', 'tá', 'ta', 'ok', 'okay', 'sei', 'certo', 'entendi', 'beleza'],
  en: ['uh huh', 'uh-huh', 'mhm', 'mm', 'hmm', 'hm', 'uh', 'um', 'ah', 'yeah', 'yep', 'ok', 'okay', 'right', 'sure', 'i see'],
  es: ['ajá', 'aja', 'mhm', 'eh', 'ah', 'vale', 'ok', 'claro', 'ya'],
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[.,!?¡¿…;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const wordsOf = (text: string) => normalize(text).split(' ').filter(Boolean)

/** End of the first complete sentence in `text` after `from`, or -1. */
function sentenceEnd(text: string, from: number): number {
  const pattern = /[.!?…]+["')\]]*(?=\s)|\n/g
  pattern.lastIndex = from
  const match = pattern.exec(text)
  return match ? match.index + match[0].length : -1
}

export const voice = definePlugin<VoiceOptions | undefined>({
  name: 'voice',
  provides: ['voice'],
  async apply(ctx, options = {}) {
    const service = await createVoice(ctx, options)
    ctx.provide('voice', service)
  },
})

async function supportedOf<T extends { isSupported(): boolean | Promise<boolean> }>(providers: T[]): Promise<T[]> {
  const checks = await Promise.all(providers.map(async (p) => ({ p, ok: await Promise.resolve(p.isSupported()).catch(() => false) })))
  return checks.filter((c) => c.ok).map((c) => c.p)
}

export async function createVoice(ctx: PluginContext, options: VoiceOptions): Promise<VoiceService> {
  const language =
    options.language || (typeof document !== 'undefined' && document.documentElement.lang) || 'en-US'
  const sttProviders = await supportedOf(toArray(options.stt))
  const player = options.player ?? webAudioPlayer()
  const playable = (p: TextToSpeech) => !!p.speak || (!!p.synthesize && player.isSupported())
  let ttsProviders = (await supportedOf(toArray(options.tts))).filter(playable)
  const allowed = (provider: { consent?: string }) => !provider.consent || ctx.app.consent.granted(provider.consent)

  let bargeIn = options.bargeIn !== false
  let bargeInOptions: BargeInOptions = typeof options.bargeIn === 'object' ? options.bargeIn : {}
  let timing: TurnTiming = { ...options.turn }
  const ms = {
    silence: () => timing.silence ?? 800,
    minSilence: () => timing.minSilence ?? 300,
    maxSilence: () => timing.maxSilence ?? 2000,
    threshold: () => timing.threshold ?? 0.5,
    timeout: () => timing.timeout ?? 600,
  }
  const backchannels = () =>
    new Set((bargeInOptions.ignore ?? BACKCHANNELS[language.slice(0, 2).toLowerCase()] ?? BACKCHANNELS.en!).map(normalize))

  const phaseOf = (s: VoiceState): VoicePhase =>
    s.listening && s.partial && s.endOfTurnAt === undefined
      ? 'userSpeaking'
      : s.endOfTurnAt !== undefined
        ? 'waitingEndOfTurn'
        : s.speaking
          ? 'botSpeaking'
          : s.listening
            ? 'listening'
            : 'idle'

  let state: VoiceState = {
    supported: { stt: sttProviders.length > 0, tts: ttsProviders.length > 0 },
    mode: options.mode ?? 'push-to-talk',
    phase: 'idle',
    listening: false,
    speaking: false,
    partial: '',
    interrupted: false,
    lastInput: 'keyboard',
    output: options.output ?? 'auto',
    stt: sttProviders[0]?.name,
    tts: ttsProviders[0]?.name,
    ttsStatus: {},
    synthesizing: false,
    effects: options.effects?.name,
  }
  let echo: EchoFilter | undefined = options.echo === false ? undefined : (options.echo ?? textEchoFilter())
  state.echo = echo?.name
  const listeners = new Set<() => void>()
  const set = (patch: Partial<VoiceState>) => {
    const next = { ...state, ...patch }
    state = { ...next, phase: phaseOf(next) }
    for (const listener of listeners) listener()
  }
  const decide = (decision: VoiceDecision) => ctx.emit('voice.decision', decision)

  /** Shows the error in the state (for the UI) and on the kernel bus (for the developer). */
  const fail = (error: SpeechError, patch: Partial<VoiceState> = {}) => {
    set({ ...patch, error })
    ctx.emit('error', { error, source: 'voice' })
  }

  /* ---------------------------------------------------------------------- */
  /* End-of-turn model                                                      */
  /* ---------------------------------------------------------------------- */

  let endOfTurn: EndOfTurn | undefined
  /** Ready to be asked: supported and loaded. */
  let endOfTurnReady = false
  const setEndOfTurn = async (provider: EndOfTurn | null | undefined) => {
    endOfTurn = provider ?? undefined
    endOfTurnReady = false
    set({ endOfTurn: endOfTurn?.name })
    if (!provider) return
    try {
      if (!(await provider.isSupported())) throw new Error('not supported')
      await provider.load?.()
      if (endOfTurn === provider) endOfTurnReady = true
    } catch (error) {
      if (endOfTurn === provider) decide({ kind: 'end-of-turn-unavailable', provider: provider.name, reason: (error as Error)?.message ?? 'failed' })
    }
  }
  void setEndOfTurn(options.endOfTurn)

  /** Recent microphone audio, for audio models. */
  let audioFrames: Float32Array[] = []
  let audioRate = 16000
  const keepAudio = (samples: Float32Array, sampleRate: number) => {
    if (endOfTurn?.input !== 'audio') return
    audioRate = sampleRate
    audioFrames.push(samples)
    const max = (timing.audioSeconds ?? 8) * sampleRate
    let total = audioFrames.reduce((sum, f) => sum + f.length, 0)
    while (total - audioFrames[0]!.length >= max) total -= audioFrames.shift()!.length
  }
  const recentAudio = () => {
    const samples = new Float32Array(audioFrames.reduce((sum, f) => sum + f.length, 0))
    let offset = 0
    for (const frame of audioFrames) {
      samples.set(frame, offset)
      offset += frame.length
    }
    return { samples, sampleRate: audioRate }
  }

  const historyFor = (turns: number): TurnHistoryEntry[] =>
    ctx.app.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as TurnHistoryEntry['role'], text: textOf(m) }))
      .filter((m) => m.text)
      .slice(-turns)

  /* ---------------------------------------------------------------------- */
  /* Hands-free turn: finals accumulate until the end of the turn           */
  /* ---------------------------------------------------------------------- */

  type Turn = { texts: string[]; live: string; confidence?: number; stt?: string; lastFinalAt: number }
  let turn: Turn = { texts: [], live: '', lastFinalAt: 0 }
  let turnTimer: ReturnType<typeof setTimeout> | undefined
  let askTimer: ReturnType<typeof setTimeout> | undefined
  let asking: AbortController | undefined
  const cache = new Map<string, number>()
  /** The user already cut the reply during this turn. */
  let bargedIn = false
  /** Live words sent before the recognizer finalized them: their late final is dropped. */
  let sentLive = ''

  const turnText = (live = turn.live) => [...turn.texts, live].filter(Boolean).join(' ')
  const clearTurnTimers = () => {
    clearTimeout(turnTimer)
    clearTimeout(askTimer)
    asking?.abort()
    asking = undefined
  }

  const sendTurn = (reason: Extract<VoiceDecision, { kind: 'end-of-turn' }>['reason'], probability?: number) => {
    clearTurnTimers()
    const text = turnText('')
    const done = turn
    turn = { texts: [], live: turn.live, lastFinalAt: 0 }
    bargedIn = false
    set({ endOfTurnAt: undefined, partial: turn.live })
    if (!text) return
    decide({ kind: 'end-of-turn', text, reason, probability })
    ctx.signal({
      modality: 'transcript',
      parts: [{ type: 'text', text }],
      source: 'voice',
      meta: { confidence: done.confidence, stt: done.stt, language },
    })
  }

  const discardPending = () => {
    clearTurnTimers()
    turn = { texts: [], live: '', lastFinalAt: 0 }
    bargedIn = false
    set({ endOfTurnAt: undefined, partial: '' })
  }

  /** Waits after a final result, asking the model if there is one. */
  const scheduleEndOfTurn = (sttDecides: boolean) => {
    clearTurnTimers()
    const at = turn.lastFinalAt
    const model =
      !sttDecides && endOfTurn && endOfTurnReady && allowed(endOfTurn) && (endOfTurn.input === 'text' || audioFrames.length > 0)
        ? endOfTurn
        : undefined
    const wait = (delay: number, reason: 'silence' | 'max-silence') => {
      clearTimeout(turnTimer)
      const deadline = at + delay
      set({ endOfTurnAt: deadline })
      turnTimer = setTimeout(() => sendTurn(reason), Math.max(0, deadline - Date.now()))
    }
    if (!model) return wait(sttDecides ? ms.maxSilence() : ms.silence(), sttDecides ? 'max-silence' : 'silence')

    wait(ms.maxSilence(), 'max-silence')
    askTimer = setTimeout(async () => {
      const text = turnText('')
      const controller = new AbortController()
      asking = controller
      let probability = cache.get(text)
      if (probability === undefined) {
        const timeout = new Promise<undefined>((resolve) => setTimeout(resolve, ms.timeout()))
        const prediction = Promise.resolve()
          .then(() =>
            model.predict(
              {
                partial: text,
                history: historyFor(model.historyTurns ?? 6),
                language,
                audio: model.input === 'audio' ? recentAudio() : undefined,
              },
              controller.signal,
            ),
          )
          .catch((error) => {
            if (!controller.signal.aborted) ctx.emit('error', { error, source: `voice:end-of-turn:${model.name}` })
            return undefined
          })
        probability = await Promise.race([prediction, timeout])
        if (probability !== undefined) {
          cache.clear()
          cache.set(text, probability)
        }
      }
      if (controller.signal.aborted || asking !== controller) return
      asking = undefined
      if (probability === undefined) {
        controller.abort()
        wait(ms.silence(), 'silence') // the model failed or is slow: silence decides
      } else if (probability >= ms.threshold()) {
        sendTurn('model', probability)
      }
    }, Math.max(0, at + ms.minSilence() - Date.now()))
  }

  /* ---------------------------------------------------------------------- */
  /* Echo: the bot's own speech coming back through the microphone          */
  /* ---------------------------------------------------------------------- */

  /** Sentences spoken recently, oldest first. */
  let speech: SpokenSentence[] = []
  const recentSpeech = () => {
    const since = Date.now() - (echo?.tail ?? 2000)
    speech = speech.filter((s) => s.endedAt === undefined || s.endedAt >= since)
    return speech
  }

  /** What the user said in `text`, without the bot's voice ('' when it was all echo). */
  const withoutEcho = (text: string, final: boolean): string => {
    if (!echo || !text.trim()) return text
    const recent = recentSpeech()
    if (recent.length === 0) return text
    try {
      return echo.filter({ text, final, speech: [...recent], language })
    } catch (error) {
      ctx.emit('error', { error, source: `voice:echo:${echo.name}` })
      return text
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Barge-in                                                               */
  /* ---------------------------------------------------------------------- */

  /** The bot is answering: speaking, or showing a reply as it streams. */
  const botAnswering = () => {
    if (state.speaking) return true
    if (!ctx.app.busy) return false
    const last = ctx.app.messages.at(-1)
    return last?.role === 'assistant' && !!last.streaming && !!textOf(last)
  }

  /**
   * Whether speech heard while the bot answers should cut it. Returns false
   * for text to drop (a backchannel over the bot).
   */
  const bargeInCheck = (text: string, final: boolean): 'interrupted' | 'ignored' | 'pending' | 'none' => {
    if (!bargeIn || bargedIn || !botAnswering()) return 'none'
    const words = wordsOf(text)
    if (words.length === 0) return 'pending'
    const ignore = backchannels()
    if (ignore.has(words.join(' ')) || words.every((w) => ignore.has(w))) {
      if (final) decide({ kind: 'ignore', text, reason: 'backchannel' })
      return final ? 'ignored' : 'pending'
    }
    if (!final && words.length < (bargeInOptions.minWords ?? 2)) return 'pending'
    bargedIn = true
    decide({ kind: 'interrupt', text })
    // Interrupt first: the interceptor reads how much was spoken before speech stops.
    void ctx.app.interrupt()
    service.cancelSpeech()
    set({ interrupted: true })
    return 'interrupted'
  }

  /* ---------------------------------------------------------------------- */
  /* Recognition sessions                                                   */
  /* ---------------------------------------------------------------------- */

  let sttIndex = 0
  /** A hold-to-talk press: finals accumulate until release, then go out as one signal. */
  type Held = { texts: string[]; confidence?: number; stt?: string; done: boolean }
  /** The live recognition session; older sessions may still flush a final result. */
  type Active = {
    session?: SttSession
    stopping: boolean
    discarded?: boolean
    held?: Held
    killTimer?: ReturnType<typeof setTimeout>
  }
  let active: Active | undefined
  /** The press in progress, while the user still holds. */
  let holding: Held | undefined
  let wantListening = false
  let pausedForSpeech = false
  let restartTimer: ReturnType<typeof setTimeout> | undefined

  const heldText = (held: Held, partial?: string) => [...held.texts, partial].filter(Boolean).join(' ')

  /** Ends a hold-to-talk press: sends what was said, once. */
  const release = (held: Held, send = true) => {
    if (holding === held) holding = undefined
    if (held.done) return
    held.done = true
    const text = heldText(held)
    if (!send || !text) return
    ctx.signal({
      modality: 'transcript',
      parts: [{ type: 'text', text }],
      source: 'voice',
      meta: { confidence: held.confidence, stt: held.stt, language },
    })
  }

  const nextProvider = () => {
    while (sttIndex < sttProviders.length && !allowed(sttProviders[sttIndex]!)) sttIndex++
    return sttProviders[sttIndex]
  }
  const hasFallbackAfter = () => sttProviders.slice(sttIndex + 1).some(allowed)

  const startSession = async (): Promise<void> => {
    const provider = nextProvider()
    if (!provider) {
      fail(new SpeechError('not-supported', 'No speech recognition available'), { listening: false })
      wantListening = false
      if (holding) release(holding)
      return
    }
    const handsFree = state.mode === 'hands-free'
    const entry: Active = { stopping: false, held: holding }
    active = entry
    const isCurrent = () => active === entry
    set({
      listening: true,
      error: undefined,
      stt: provider.name,
      partial: entry.held ? heldText(entry.held) : handsFree ? turnText() : '',
    })
    let failed: SpeechError | undefined
    try {
      entry.session = await provider.listen(
        { language, continuous: handsFree || !!entry.held },
        {
          onPartial(heard) {
            if (!isCurrent() || entry.stopping) return
            const text = withoutEcho(heard, false)
            if (entry.held) return set({ partial: heldText(entry.held, text) })
            bargeInCheck(text, false)
            if (!handsFree) return set({ partial: text })
            turn.live = text
            if (!text.trim()) return set({ partial: turnText() })
            // The user keeps talking: the pending turn waits for the next final result,
            // or goes out with these words if the recognizer never delivers one.
            if (turn.texts.length > 0) {
              clearTurnTimers()
              turnTimer = setTimeout(() => service.endTurn(), ms.maxSilence())
            }
            set({ partial: turnText(), endOfTurnAt: undefined })
          },
          onFinal(text, meta) {
            if (entry.discarded) return
            const heard = text.trim()
            const trimmed = withoutEcho(heard, true).trim()
            if (heard && !trimmed) {
              decide({ kind: 'ignore', text: heard, reason: 'echo' })
              if (handsFree && !entry.held) turn.live = ''
              if (isCurrent()) set({ partial: entry.held ? heldText(entry.held) : handsFree ? turnText() : '' })
              return
            }
            const held = entry.held
            if (held) {
              if (isCurrent()) set({ partial: '' })
              if (held.done || !trimmed) return
              if (bargeInCheck(trimmed, true) === 'ignored') return
              held.texts.push(trimmed)
              held.stt = provider.name
              if (meta?.confidence !== undefined) held.confidence = Math.min(held.confidence ?? 1, meta.confidence)
              if (isCurrent() && !entry.stopping) set({ partial: heldText(held) })
              return
            }
            if (!trimmed) return
            if (sentLive) {
              const duplicate = normalize(trimmed) === sentLive
              sentLive = ''
              if (duplicate) return
            }
            if (bargeInCheck(trimmed, true) === 'ignored') {
              if (handsFree) turn.live = ''
              if (isCurrent()) set({ partial: handsFree ? turnText() : '' })
              return
            }
            if (!handsFree) {
              // A stopped session may still deliver the last utterance: keep it.
              if (isCurrent()) set({ partial: '' })
              ctx.signal({
                modality: 'transcript',
                parts: [{ type: 'text', text: trimmed }],
                source: 'voice',
                meta: { confidence: meta?.confidence, stt: provider.name, language },
              })
              return
            }
            turn.texts.push(trimmed)
            turn.live = ''
            turn.stt = provider.name
            turn.lastFinalAt = Date.now()
            if (meta?.confidence !== undefined) turn.confidence = Math.min(turn.confidence ?? 1, meta.confidence)
            set({ partial: turnText() })
            const sttDecides = !!provider.capabilities.endOfTurn
            if (entry.stopping || !wantListening || (sttDecides && meta?.endOfTurn === true)) {
              sendTurn(sttDecides && meta?.endOfTurn ? 'stt' : 'manual')
            } else {
              scheduleEndOfTurn(sttDecides)
            }
          },
          onAudio(samples, sampleRate) {
            if (isCurrent() && !entry.stopping) keepAudio(samples, sampleRate)
          },
          onError(error) {
            failed = error
            if (isCurrent() && error.code !== 'no-speech') fail(error)
          },
          onEnd() {
            clearTimeout(entry.killTimer)
            if (!isCurrent()) {
              if (entry.held && entry.held !== holding) release(entry.held)
              return
            }
            active = undefined
            const hasFallback = !!failed?.recoverable && hasFallbackAfter()
            // Asking again cannot help: the user has to change a permission or a setting first.
            if (failed?.code === 'not-allowed' || (failed?.code === 'service-not-allowed' && !hasFallback)) {
              wantListening = false
            }
            // Hold-to-talk outlives the browser's session: start another until release.
            const keepHolding = !!entry.held && entry.held === holding && wantListening && !pausedForSpeech
            turn.live = ''
            set({
              listening: keepHolding,
              partial: keepHolding && entry.held ? heldText(entry.held) : handsFree ? turnText() : '',
            })
            if (hasFallback) {
              sttIndex++
              if (wantListening) void startSession()
              else if (entry.held) release(entry.held)
              return
            }
            if (keepHolding) {
              restartTimer = setTimeout(() => wantListening && !active && void startSession(), 250)
              return
            }
            if (entry.held) release(entry.held)
            // Browsers end recognition after silence; hands-free keeps going.
            if (wantListening && state.mode === 'hands-free' && !pausedForSpeech) {
              restartTimer = setTimeout(() => wantListening && !active && void startSession(), 250)
            } else if (state.mode === 'push-to-talk') {
              wantListening = false
            } else if (!wantListening && turn.texts.length > 0) {
              sendTurn('manual')
            }
          },
        },
      )
    } catch (error) {
      const speechError = error instanceof SpeechError ? error : new SpeechError('unknown', (error as Error)?.message)
      if (isCurrent()) active = undefined
      fail(speechError, { listening: false })
      if (speechError.recoverable && hasFallbackAfter()) {
        sttIndex++
        return startSession()
      }
      wantListening = false
      if (entry.held) release(entry.held)
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Speech output, sentence by sentence                                    */
  /* ---------------------------------------------------------------------- */

  let disposed = false
  let effects: SpeechEffects | undefined = options.effects ?? undefined
  let unfollowEffects: (() => void) | undefined
  const followEffects = () => {
    unfollowEffects?.()
    const current = effects
    unfollowEffects = current?.subscribe?.(() => {
      if (state.effects !== current.name) set({ effects: current.name })
    })
    if (state.effects !== current?.name) set({ effects: current?.name })
  }
  const loadStart = options.load?.start ?? 'first-use'
  const whileLoading = options.load?.whileLoading ?? 'fallback'

  /* Models: when they download and which provider speaks meanwhile. */

  const statuses = new Map<TextToSpeech, TtsStatus>()
  const loads = new Map<TextToSpeech, Promise<boolean>>()
  const loadControllers = new Set<AbortController>()
  /** The loading policy has been triggered: failed downloads move on to the next model. */
  let loadingWanted = false
  const statusOf = (p: TextToSpeech): TtsStatus =>
    statuses.get(p) ?? (p.load ? { state: 'unloaded', total: p.size } : { state: 'ready' })
  const publishStatus = () => set({ ttsStatus: Object.fromEntries(ttsProviders.map((p) => [p.name, statusOf(p)])) })
  const setStatus = (p: TextToSpeech, status: TtsStatus) => {
    statuses.set(p, status)
    publishStatus()
  }
  const ready = (p: TextToSpeech) => statusOf(p).state === 'ready'
  const usable = (p: TextToSpeech) => allowed(p) && statusOf(p).state !== 'failed'
  /** The provider speech should come from, once it is ready. */
  const preferred = () => ttsProviders.find(usable)

  const loadProvider = (p: TextToSpeech): Promise<boolean> => {
    if (!p.load || ready(p)) return Promise.resolve(true)
    const running = loads.get(p)
    if (running) return running
    const controller = new AbortController()
    loadControllers.add(controller)
    let lastProgress = 0
    setStatus(p, { state: 'loading', loaded: 0, total: p.size })
    const promise = p
      .load((progress) => {
        const now = Date.now()
        if (controller.signal.aborted || now - lastProgress < 100) return
        lastProgress = now
        setStatus(p, { state: 'loading', loaded: progress.loaded, total: progress.total ?? p.size })
      }, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return false
        setStatus(p, { state: 'ready', loaded: statusOf(p).loaded, total: statusOf(p).total })
        return true
      })
      .catch((error) => {
        if (controller.signal.aborted) return false
        setStatus(p, { state: 'failed', error: (error as Error)?.message ?? String(error) })
        ctx.emit('error', { error, source: `voice:tts:${p.name}` })
        if (loadingWanted) void loadPreferred()
        return false
      })
      .finally(() => {
        loads.delete(p)
        loadControllers.delete(controller)
      })
    loads.set(p, promise)
    return promise
  }

  const loadPreferred = () => {
    loadingWanted = true
    const p = preferred()
    return p ? loadProvider(p) : Promise.resolve(false)
  }

  /**
   * Who speaks the next sentence; `undefined` = nobody (silent until the model
   * is ready). Synchronous unless it has to wait for a download.
   */
  const choose = (): TextToSpeech | undefined | Promise<TextToSpeech | undefined> => {
    const first = preferred()
    if (!first || ready(first)) return first
    if (loadStart === 'first-use') void loadPreferred()
    switch (whileLoading) {
      case 'fallback':
        return ttsProviders.find((p) => p !== first && usable(p) && ready(p))
      case 'wait': {
        // Only a download in progress is waited for: with `manual`, nothing speaks before `loadSpeech()`.
        const running = loads.get(first)
        return running?.then(() => choose())
      }
      case 'silent':
        return undefined
      default: {
        const never: never = whileLoading
        throw new Error(`Unknown whileLoading: ${String(never)}`)
      }
    }
  }

  switch (loadStart) {
    case 'eager':
      void loadPreferred()
      break
    case 'idle': {
      const idle = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      const start = () => !disposed && void loadPreferred()
      if (idle) idle(start, { timeout: 5000 })
      else setTimeout(start, 1500)
      break
    }
    case 'first-use':
    case 'manual':
      break
    default: {
      const never: never = loadStart
      throw new Error(`Unknown load.start: ${String(never)}`)
    }
  }

  /* Audio output: browsers allow it only after a user gesture. */

  const unlockAudio = () => {
    if (player.isSupported() && ttsProviders.some((p) => p.synthesize)) player.unlock()
  }
  const gestures = ['pointerdown', 'keydown', 'touchend'] as const
  if (typeof document !== 'undefined') {
    for (const type of gestures) document.addEventListener(type, unlockAudio, { capture: true, passive: true })
  }

  /* Sentences: synthesis runs ahead of playback, one at a time. */

  let speechController: AbortController | undefined
  let speechQueue: Promise<void> = Promise.resolve()
  let synthQueue: Promise<unknown> = Promise.resolve()
  let synthesizing = 0
  /** Chunks queued and not finished: `speaking` stays on between sentences. */
  let chunksLeft = 0
  /** Per assistant message being spoken: characters queued and characters already spoken. */
  type Track = { speak: boolean; queued: number; spoken: number }
  const tracks = new Map<string, Track>()

  type Prepared = { provider: TextToSpeech; options: SpeakOptions; plan: ProsodyPlan; audio?: SpeechAudio }
  const viaPlayer = (p: TextToSpeech) => !!p.synthesize && player.isSupported()

  const synthesize = (provider: TextToSpeech, text: string, speakOptions: SpeakOptions, signal: AbortSignal) => {
    const job = synthQueue.then(async () => {
      if (signal.aborted) return undefined
      set({ synthesizing: ++synthesizing > 0 })
      try {
        return await provider.synthesize!(text, speakOptions)
      } finally {
        set({ synthesizing: --synthesizing > 0 })
      }
    })
    synthQueue = job.catch(() => undefined)
    return job
  }

  const plainSpeech = (provider: TextToSpeech, signal: AbortSignal): Prepared => {
    const plan = planProsody(provider.prosody, effects?.prosody?.(), false)
    return { provider, plan, options: { language, voice: options.voiceName, signal, prosody: plan.synth } }
  }

  /**
   * Picks the provider and, for models and cloud audio, starts synthesizing
   * right away. Providers that speak by themselves are prepared synchronously,
   * so their speech starts in the same tick as before there were models.
   */
  const prepare = (text: string, signal: AbortSignal): Prepared | undefined | Promise<Prepared | undefined> => {
    const chosen = choose()
    if (chosen instanceof Promise) return chosen.then((p) => (p ? synthesizeWith(p, text, signal) : undefined))
    if (!chosen) return undefined
    return viaPlayer(chosen) ? synthesizeWith(chosen, text, signal) : plainSpeech(chosen, signal)
  }

  const synthesizeWith = async (first: TextToSpeech, text: string, signal: AbortSignal): Promise<Prepared | undefined> => {
    let provider: TextToSpeech | undefined = first
    while (provider && !signal.aborted) {
      if (!viaPlayer(provider)) return plainSpeech(provider, signal)
      const plan = planProsody(provider.prosody, effects?.prosody?.(), true)
      const speakOptions: SpeakOptions = { language, voice: options.voiceName, signal, prosody: plan.synth }
      try {
        const audio = await synthesize(provider, text, speakOptions, signal)
        return audio && { provider, options: speakOptions, plan, audio }
      } catch (error) {
        if (signal.aborted) return undefined
        ctx.emit('error', { error, source: `voice:tts:${provider.name}` })
        // This sentence goes to the next ready provider (the backend is down, the model choked).
        const failed: TextToSpeech = provider
        provider = ttsProviders.slice(ttsProviders.indexOf(failed) + 1).find((p) => usable(p) && ready(p))
        if (!provider) throw error
      }
    }
    return undefined
  }

  const speakChunk = (text: string, onSpoken?: () => void): Promise<void> => {
    if (!preferred() || !text.trim()) {
      onSpoken?.()
      return Promise.resolve()
    }
    const controller = (speechController ??= new AbortController())
    chunksLeft++
    let job: ReturnType<typeof prepare>
    try {
      job = prepare(text, controller.signal)
    } catch (error) {
      job = Promise.reject(error)
    }
    if (job instanceof Promise) job.catch(() => {})
    speechQueue = speechQueue.then(async () => {
      let prepared: Prepared | undefined
      let sentence: SpokenSentence | undefined
      try {
        prepared = job instanceof Promise ? await job : job
        if (controller.signal.aborted) return
        // Nobody can speak it yet: the text stays as shown.
        if (!prepared) return onSpoken?.()
        set({ speaking: true, tts: prepared.provider.name })
        sentence = { text, startedAt: Date.now() }
        recentSpeech().push(sentence)
        // Without barge-in the mic would hear the bot: pause recognition while speaking.
        if (!bargeIn && active?.session) {
          pausedForSpeech = true
          active.session.abort()
        }
        if (prepared.audio) {
          await player.play(prepared.audio, {
            effects,
            playbackRate: prepared.plan.playbackRate,
            gainDb: prepared.plan.gainDb,
            signal: controller.signal,
          })
        } else {
          await prepared.provider.speak!(text, prepared.options)
        }
        if (!controller.signal.aborted) onSpoken?.()
      } catch (error) {
        if (!controller.signal.aborted) fail(error instanceof SpeechError ? error : new SpeechError('unknown', (error as Error)?.message))
      } finally {
        if (sentence) sentence.endedAt ??= Date.now()
        chunksLeft = Math.max(0, chunksLeft - 1)
        if (chunksLeft === 0 || controller.signal.aborted) set({ speaking: false })
        if (pausedForSpeech) {
          pausedForSpeech = false
          if (wantListening && state.mode === 'hands-free') void startSession()
        }
      }
    })
    return speechQueue
  }

  /** Speaks the complete sentences of an assistant message as they stream in (`end`: the rest too). */
  const follow = (messageId: string, end: boolean) => {
    const message = ctx.app.conversation.find(messageId)
    if (message?.role !== 'assistant') return
    let track = tracks.get(messageId)
    if (!track) {
      const speak = state.output === 'voice' || (state.output === 'auto' && state.lastInput === 'voice')
      track = { speak, queued: 0, spoken: 0 }
      tracks.set(messageId, track)
      if (tracks.size > 8) tracks.delete(tracks.keys().next().value!)
      if (state.interrupted) set({ interrupted: false })
    }
    if (!track.speak || (message as AssistantMessage).interrupted) return
    const text = textOf(message)
    const current = track
    // One chunk per sentence, so an interruption knows which sentences were heard.
    while (current.queued < text.length) {
      const sentence = sentenceEnd(text, current.queued)
      const until = sentence > current.queued ? sentence : end ? text.length : -1
      if (until < 0) return
      const chunk = text.slice(current.queued, until)
      current.queued = until
      void speakChunk(chunk, () => (current.spoken = until))
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Service                                                                */
  /* ---------------------------------------------------------------------- */

  const service: VoiceService = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async listen(options = {}) {
      if (active && !active.stopping) return
      if (active) {
        // Pressed again while the previous session was still flushing.
        const previous = active
        active = undefined
        clearTimeout(previous.killTimer)
        previous.session?.abort()
        if (previous.held) release(previous.held)
      }
      clearTimeout(restartTimer)
      if (holding) release(holding)
      holding =
        options.until === 'stop' && state.mode === 'push-to-talk' ? { texts: [], done: false } : undefined
      wantListening = true
      // Usually a click: the reply to come may be played long after it.
      unlockAudio()
      // Pressing to talk while the bot answers is a barge-in.
      if (bargeIn && botAnswering()) {
        bargedIn = true
        decide({ kind: 'interrupt', text: '' })
        void ctx.app.interrupt()
        service.cancelSpeech()
        set({ interrupted: true })
      } else if (state.speaking) {
        service.cancelSpeech()
      }
      await startSession()
    },
    stop() {
      wantListening = false
      clearTimeout(restartTimer)
      const entry = active
      const press = holding
      holding = undefined
      // The mic turns off for the user right away; the provider flushes in the background.
      set({ listening: false, partial: state.mode === 'hands-free' ? turnText('') : '' })
      if (!entry || entry.stopping) {
        // Released between two sessions of a hold-to-talk press.
        if (press) release(press)
        if (turn.texts.length > 0) sendTurn('manual')
        return
      }
      entry.stopping = true
      entry.session?.stop()
      entry.killTimer = setTimeout(() => {
        if (active === entry) {
          entry.session?.abort()
          active = undefined
        }
        if (entry.held) release(entry.held)
        if (turn.texts.length > 0) sendTurn('manual')
      }, 3000)
    },
    cancel() {
      wantListening = false
      clearTimeout(restartTimer)
      if (holding) release(holding, false)
      discardPending()
      const entry = active
      active = undefined
      set({ listening: false, partial: '' })
      if (!entry) return
      entry.discarded = true
      if (entry.held) release(entry.held, false)
      clearTimeout(entry.killTimer)
      entry.session?.abort()
    },
    endTurn() {
      if (turn.texts.length > 0 || turn.live) {
        // Words still being recognized go out too.
        sentLive = normalize(turn.live)
        turn.texts.push(...(turn.live ? [turn.live] : []))
        turn.live = ''
        sendTurn('manual')
      }
    },
    discardTurn() {
      discardPending()
      if (state.mode !== 'hands-free') return
      // Drop what the recognizer is still holding as well.
      const entry = active
      if (entry && !entry.stopping) {
        entry.discarded = true
        active = undefined
        entry.session?.abort()
        if (wantListening) restartTimer = setTimeout(() => wantListening && !active && void startSession(), 250)
      }
    },
    async toggle() {
      if (state.listening || wantListening) service.stop()
      else await service.listen()
    },
    setMode(mode) {
      if (mode === state.mode) return
      const wasListening = wantListening
      service.stop()
      set({ mode })
      if (wasListening && mode === 'hands-free') void service.listen()
    },
    setOutput(output) {
      set({ output })
      if (output === 'text') service.cancelSpeech()
    },
    setEndOfTurn(provider) {
      void setEndOfTurn(provider)
    },
    setEcho(filter) {
      echo = filter ?? undefined
      set({ echo: echo?.name })
    },
    configure(change) {
      if (change.turn) timing = { ...timing, ...change.turn }
      if (change.bargeIn !== undefined) {
        bargeIn = change.bargeIn !== false
        if (typeof change.bargeIn === 'object') bargeInOptions = { ...bargeInOptions, ...change.bargeIn }
      }
    },
    speak(text) {
      return speakChunk(text)
    },
    cancelSpeech() {
      speechController?.abort()
      speechController = undefined
      player.stop()
      for (const p of ttsProviders) p.cancel?.()
      speechQueue = Promise.resolve()
      chunksLeft = 0
      // What was playing can still reach the recognizer for a moment.
      const now = Date.now()
      for (const sentence of speech) sentence.endedAt ??= now
      // Messages already queued stop being spoken; their `spoken` count stays.
      for (const track of tracks.values()) track.speak = false
      if (state.speaking) set({ speaking: false })
    },
    loadSpeech(name) {
      if (name === undefined) return loadPreferred()
      const p = ttsProviders.find((provider) => provider.name === name)
      return p ? loadProvider(p) : Promise.resolve(false)
    },
    async setTTS(tts) {
      const next = (await supportedOf(toArray(tts))).filter(playable)
      service.cancelSpeech()
      for (const p of ttsProviders) if (!next.includes(p)) statuses.delete(p)
      ttsProviders = next
      set({ supported: { ...state.supported, tts: next.length > 0 }, tts: next[0]?.name })
      publishStatus()
      if (loadingWanted || loadStart === 'eager') void loadPreferred()
    },
    setEffects(next) {
      effects = next ?? undefined
      followEffects()
    },
    unlockAudio,
  }
  publishStatus()
  followEffects()

  // Which modality did the user use last?
  ctx.on('signal', (signal) => {
    if (signal.kind !== 'trigger') return
    if (signal.modality === 'transcript' || signal.modality === 'audio') set({ lastInput: 'voice' })
    else if (signal.modality === 'text') set({ lastInput: 'keyboard' })
  })

  // Output follows input: speak assistant replies sentence by sentence as they arrive.
  ctx.on('stimulus', ({ stimulus }) => {
    if (stimulus.type === 'message.delta' || stimulus.type === 'message.part') follow(stimulus.messageId, false)
    else if (stimulus.type === 'message.end') follow(stimulus.messageId, true)
  })

  // An interrupted reply keeps only what was spoken.
  ctx.intercept('interrupt.before', (point) => {
    const track = tracks.get(point.messageId)
    if (!track || track.queued === 0) return
    if (track.spoken >= point.text.length) return
    return { ...point, keep: Math.min(point.keep, track.spoken) }
  })

  // A new turn from the keyboard makes pending speech obsolete.
  ctx.on('turn.status', (status) => {
    if (status.phase === 'received' && status.signal?.modality === 'text') service.cancelSpeech()
  })

  ctx.onDispose(() => {
    disposed = true
    unfollowEffects?.()
    for (const controller of loadControllers) controller.abort()
    if (typeof document !== 'undefined') {
      for (const type of gestures) document.removeEventListener(type, unlockAudio, { capture: true })
    }
    wantListening = false
    if (holding) release(holding, false)
    clearTimeout(restartTimer)
    clearTurnTimers()
    active?.session?.abort()
    service.cancelSpeech()
    listeners.clear()
  })

  return service
}
