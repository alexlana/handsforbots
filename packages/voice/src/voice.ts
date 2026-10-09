import { definePlugin, textOf, type PluginContext } from '@handsforbots/core'
import { SpeechError, type SpeechToText, type SttSession, type TextToSpeech } from './types.js'

export type VoiceMode = 'push-to-talk' | 'hands-free'
export type InputModality = 'keyboard' | 'voice'
/** `auto`: answer with voice when the user spoke, with text when they typed. */
export type OutputPreference = 'auto' | 'voice' | 'text'

export type VoiceState = {
  supported: { stt: boolean; tts: boolean }
  mode: VoiceMode
  listening: boolean
  speaking: boolean
  /** Live transcript while the user speaks. */
  partial: string
  /** Modality of the user's last trigger. */
  lastInput: InputModality
  output: OutputPreference
  /** Active providers. */
  stt?: string
  tts?: string
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

export type VoiceService = {
  getState(): VoiceState
  subscribe(listener: () => void): () => void
  /** Start listening (push-to-talk press, mic button, hands-free on). */
  listen(options?: ListenOptions): Promise<void>
  /** Stop listening; the current utterance is still transcribed and sent. */
  stop(): void
  /** Stop listening and discard the current utterance: nothing is sent. */
  cancel(): void
  toggle(): Promise<void>
  setMode(mode: VoiceMode): void
  setOutput(output: OutputPreference): void
  speak(text: string): Promise<void>
  cancelSpeech(): void
}

declare module '@handsforbots/core' {
  interface Services {
    voice: VoiceService
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
  /** Interrupt speech when the user starts talking. Default true. */
  bargeIn?: boolean
  /** Partial transcript length that counts as the user talking over the bot. Default 4. */
  bargeInChars?: number
  voiceName?: string
}

const toArray = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value])

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
  const ttsProviders = await supportedOf(toArray(options.tts))
  const bargeIn = options.bargeIn ?? true
  const bargeInChars = options.bargeInChars ?? 4

  let state: VoiceState = {
    supported: { stt: sttProviders.length > 0, tts: ttsProviders.length > 0 },
    mode: options.mode ?? 'push-to-talk',
    listening: false,
    speaking: false,
    partial: '',
    lastInput: 'keyboard',
    output: options.output ?? 'auto',
    stt: sttProviders[0]?.name,
    tts: ttsProviders[0]?.name,
  }
  const listeners = new Set<() => void>()
  const set = (patch: Partial<VoiceState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

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
  let speechController: AbortController | undefined
  let speechQueue: Promise<void> = Promise.resolve()
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

  const startSession = async (): Promise<void> => {
    const provider = sttProviders[sttIndex]
    if (!provider) {
      set({ error: new SpeechError('not-supported', 'No speech recognition available'), listening: false })
      wantListening = false
      if (holding) release(holding)
      return
    }
    const entry: Active = { stopping: false, held: holding }
    active = entry
    const isCurrent = () => active === entry
    set({ listening: true, error: undefined, stt: provider.name, partial: entry.held ? heldText(entry.held) : '' })
    let failed: SpeechError | undefined
    try {
      entry.session = await provider.listen(
        { language, continuous: state.mode === 'hands-free' || !!entry.held },
        {
          onPartial(text) {
            if (!isCurrent() || entry.stopping) return
            set({ partial: entry.held ? heldText(entry.held, text) : text })
            if (bargeIn && state.speaking && text.length >= bargeInChars) service.cancelSpeech()
          },
          onFinal(text, meta) {
            if (entry.discarded) return
            // A stopped session may still deliver the last utterance: keep it.
            if (isCurrent()) set({ partial: '' })
            if (state.speaking && bargeIn) service.cancelSpeech()
            const held = entry.held
            if (held) {
              if (held.done || !text.trim()) return
              held.texts.push(text.trim())
              held.stt = provider.name
              if (meta?.confidence !== undefined) held.confidence = Math.min(held.confidence ?? 1, meta.confidence)
              if (isCurrent() && !entry.stopping) set({ partial: heldText(held) })
              return
            }
            ctx.signal({
              modality: 'transcript',
              parts: [{ type: 'text', text }],
              source: 'voice',
              meta: { confidence: meta?.confidence, stt: provider.name, language },
            })
          },
          onError(error) {
            failed = error
            if (isCurrent() && error.code !== 'no-speech') set({ error })
          },
          onEnd() {
            clearTimeout(entry.killTimer)
            if (!isCurrent()) {
              if (entry.held && entry.held !== holding) release(entry.held)
              return
            }
            active = undefined
            const hasFallback = !!failed?.recoverable && sttIndex < sttProviders.length - 1
            // Asking again cannot help: the user has to change a permission or a setting first.
            if (failed?.code === 'not-allowed' || (failed?.code === 'service-not-allowed' && !hasFallback)) {
              wantListening = false
            }
            // Hold-to-talk outlives the browser's session: start another until release.
            const keepHolding = !!entry.held && entry.held === holding && wantListening && !pausedForSpeech
            set({ listening: keepHolding, partial: keepHolding && entry.held ? heldText(entry.held) : '' })
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
            }
          },
        },
      )
    } catch (error) {
      const speechError = error instanceof SpeechError ? error : new SpeechError('unknown', (error as Error)?.message)
      if (isCurrent()) active = undefined
      set({ listening: false, error: speechError })
      if (speechError.recoverable && sttIndex < sttProviders.length - 1) {
        sttIndex++
        return startSession()
      }
      wantListening = false
      if (entry.held) release(entry.held)
    }
  }

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
      // Talking while the bot speaks is a barge-in.
      if (state.speaking) service.cancelSpeech()
      await startSession()
    },
    stop() {
      wantListening = false
      clearTimeout(restartTimer)
      const entry = active
      const press = holding
      holding = undefined
      // The mic turns off for the user right away; the provider flushes in the background.
      set({ listening: false, partial: '' })
      if (!entry || entry.stopping) {
        // Released between two sessions of a hold-to-talk press.
        if (press) release(press)
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
      }, 3000)
    },
    cancel() {
      wantListening = false
      clearTimeout(restartTimer)
      if (holding) release(holding, false)
      const entry = active
      active = undefined
      set({ listening: false, partial: '' })
      if (!entry) return
      entry.discarded = true
      if (entry.held) release(entry.held, false)
      clearTimeout(entry.killTimer)
      entry.session?.abort()
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
    speak(text) {
      const provider = ttsProviders[0]
      if (!provider || !text.trim()) return Promise.resolve()
      const controller = (speechController ??= new AbortController())
      speechQueue = speechQueue.then(async () => {
        if (controller.signal.aborted) return
        set({ speaking: true, tts: provider.name })
        // Without barge-in the mic would hear the bot: pause recognition while speaking.
        if (!bargeIn && active?.session) {
          pausedForSpeech = true
          active.session.abort()
        }
        try {
          await provider.speak(text, { language, voice: options.voiceName, signal: controller.signal })
        } catch (error) {
          set({ error: error instanceof SpeechError ? error : new SpeechError('unknown', (error as Error)?.message) })
        } finally {
          set({ speaking: false })
          if (pausedForSpeech) {
            pausedForSpeech = false
            if (wantListening && state.mode === 'hands-free') void startSession()
          }
        }
      })
      return speechQueue
    },
    cancelSpeech() {
      speechController?.abort()
      speechController = undefined
      ttsProviders[0]?.cancel()
      speechQueue = Promise.resolve()
      if (state.speaking) set({ speaking: false })
    },
  }

  // Which modality did the user use last?
  ctx.on('signal', (signal) => {
    if (signal.kind !== 'trigger') return
    if (signal.modality === 'transcript' || signal.modality === 'audio') set({ lastInput: 'voice' })
    else if (signal.modality === 'text') set({ lastInput: 'keyboard' })
  })

  // Output follows input: speak finished assistant messages when appropriate.
  ctx.on('stimulus', ({ stimulus }) => {
    if (stimulus.type !== 'message.end') return
    const shouldSpeak = state.output === 'voice' || (state.output === 'auto' && state.lastInput === 'voice')
    if (!shouldSpeak) return
    const message = ctx.app.conversation.find(stimulus.messageId)
    if (message?.role === 'assistant') void service.speak(textOf(message))
  })

  // A new turn from the keyboard makes pending speech obsolete.
  ctx.on('turn.status', (status) => {
    if (status.phase === 'received' && status.signal?.modality === 'text') service.cancelSpeech()
  })

  ctx.onDispose(() => {
    wantListening = false
    if (holding) release(holding, false)
    clearTimeout(restartTimer)
    active?.session?.abort()
    service.cancelSpeech()
    listeners.clear()
  })

  return service
}
