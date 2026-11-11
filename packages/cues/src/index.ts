import {
  definePlugin,
  textOf,
  type AssistantMessage,
  type DataPart,
  type Message,
  type Modality,
  type PluginDefinition,
  type Services,
  type Signal,
  type SourcePart,
} from '@handsforbots/core'

/** The parts of `@handsforbots/voice` cues read, without importing it. */
type VoiceLike = { willSpeakReplies?(): boolean }
type VoiceSpeech = { phase: string; messageId?: string }
type VoiceTrack = { messageId: string; speak: boolean }

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** What happens when a value repeats (ADR 0018). */
export type RepeatPolicy = {
  /** What `levels` and `max` count: messages in a row with the value (default) or all of them in the conversation. */
  by?: 'streak' | 'count'
  /** Thresholds that raise the level, ascending: `[2, 4]` → level 2 from the 2nd, level 3 from the 4th. */
  levels?: number[]
  /** How many times the value may apply; past it, the value becomes `then`. */
  max?: number
  /** Value used past `max` (same channel). Default: the channel's `default`. */
  then?: string
}

/** A presentation dimension with a closed vocabulary (tone, scene, urgency…). */
export type CueChannel = {
  /** Accepted values, as codes (`[A-Za-z0-9_.:-]{1,64}`). */
  values: readonly string[]
  /** Value when nobody decided. Must be in `values`. */
  default: string
  /** `'message'` (default): a message without a value goes back to `default`. `'sticky'`: keeps the previous value. */
  persist?: 'message' | 'sticky'
  /** Repetition policy per value. */
  repeat?: Record<string, RepeatPolicy>
  /** What the channel means, for the `set_cues` action's JSON Schema. */
  description?: string
}

/** What a rule sees when an assistant message ends. */
export type CueRuleContext = {
  message: AssistantMessage
  /** The message's text. */
  text: string
  sources: SourcePart[]
  /** Everything `classify` returned for the message's sources. */
  taxonomies: ReadonlySet<string>
  /** Actions run in the same turn (besides `set_cues`). */
  actions: ReadonlyArray<{ name: string; origin: string; error?: string }>
  /** `source` of every `error` event in the same turn. */
  errors: readonly string[]
  /** Cut short by `h4b.interrupt()`. */
  interrupted: boolean
  /** The signal that started the turn, if any. */
  trigger?: Signal
}

/** Declarative condition: every key given must match. */
export type CueCondition = {
  /** Matches when some source of the message matches every field given. */
  source?: { urlPrefix?: string; trail?: string; title?: string; taxonomy?: string }
  /** Some source was classified under this taxonomy. */
  taxonomy?: string
  /** An action with this name ran in the turn. */
  action?: string
  /** `error`: an error happened in the turn; `action.failed`: an action failed or was refused; `interrupted`: the message was cut. */
  event?: 'error' | 'action.failed' | 'interrupted'
  /** Modality of the signal that started the turn. */
  trigger?: Modality
  /** Tested against the message's text. */
  text?: RegExp
}

export type CueRule = {
  when: CueCondition | ((context: CueRuleContext) => boolean)
  /** Values to set, per channel. */
  set: Record<string, string>
  /** Higher wins. Ties: the last rule declared. Default 0. */
  priority?: number
}

export type CuesOptions = {
  channels: Record<string, CueChannel>
  rules?: CueRule[]
  /** Taxonomies of a source, for rules with `taxonomy`. */
  classify?: (source: SourcePart) => readonly string[]
  /** Sends the current state to the backend as the context signal `cues.state`. Recommended with `max`. */
  report?: boolean
  /** Registers the `set_cues` action for backends that use tool calling. Default true; a string renames it. */
  action?: boolean | string
  /**
   * When the page sees a reply's cues. `'speech'` (default): when the `voice`
   * plugin speaks the reply, its cues wait for its first spoken chunk; replies
   * that are not spoken show them on arrival. `'arrival'`: always on arrival.
   */
  sync?: 'speech' | 'arrival'
}

/** Who decided a value. */
export type CueFrom = 'backend' | 'rule' | 'default' | 'sticky' | 'repeat'

export type CueState = {
  value: string
  /** Value of the previous message. */
  previous?: string
  /** Assistant messages in a row with `value`, this one included (0 before any message). */
  streak: number
  /** Assistant messages with `value` in the conversation, this one included. */
  count: number
  /** 1 plus the `levels` reached. */
  level: number
  from: CueFrom
  /** The value asked for, when the repetition policy replaced it. */
  requested?: string
  messageId?: string
  /** Not stored yet: set by the backend while the message is still arriving. */
  pending?: boolean
}

export type CuesState = Readonly<Record<string, CueState>>

/** Stored in the assistant message as `{ type: 'data', name: 'cues', value }`. */
export type StoredCues = Record<string, { value: string; level: number; from: CueFrom; requested?: string }>

export type CuesControl = {
  getState(): CuesState
  subscribe(listener: () => void): () => void
  /** Channel definitions, as validated. */
  readonly channels: Readonly<Record<string, CueChannel>>
  /** JSON Schema of the `set_cues` arguments (one `enum` per channel). */
  schema(): Record<string, unknown>
}

declare module '@handsforbots/core' {
  interface Services {
    cues: CuesControl
  }
  interface Events {
    /** A channel's state changed (ADR 0018). */
    'cue.changed': CueState & { channel: string }
    /** A repetition level was reached or a value was replaced by its policy. */
    'cue.repeat': { channel: string; value: string; level: number; streak: number; count: number; replaced?: string; messageId: string }
  }
}

export const CUES_PART = 'cues'
export const CUES_CONTEXT_KEY = 'cues.state'

const CODE = /^[A-Za-z0-9_.:-]{1,64}$/
const CHANNEL = /^[a-z][a-z0-9-]{0,31}$/

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function checkChannels(channels: Record<string, CueChannel>): Record<string, CueChannel> {
  const names = Object.keys(channels ?? {})
  if (!names.length) throw new Error('[h4b] cues: declare at least one channel.')
  for (const name of names) {
    const channel = channels[name]!
    const where = `[h4b] cues: channel "${name}"`
    if (!CHANNEL.test(name)) throw new Error(`${where}: names are lowercase letters, digits and "-", starting with a letter.`)
    if (!Array.isArray(channel.values) || !channel.values.length) throw new Error(`${where} needs values.`)
    for (const value of channel.values) {
      if (typeof value !== 'string' || !CODE.test(value)) throw new Error(`${where}: "${value}" is not a code ([A-Za-z0-9_.:-]{1,64}).`)
    }
    if (!channel.values.includes(channel.default)) throw new Error(`${where}: default "${channel.default}" is not in values.`)
    for (const [value, policy] of Object.entries(channel.repeat ?? {})) {
      if (!channel.values.includes(value)) throw new Error(`${where}: repeat for unknown value "${value}".`)
      const levels = policy.levels ?? []
      if (!levels.every((n, i) => Number.isInteger(n) && n >= 2 && (i === 0 || n > levels[i - 1]!))) {
        throw new Error(`${where}: levels of "${value}" must be ascending integers from 2.`)
      }
      if (policy.max !== undefined && !(Number.isInteger(policy.max) && policy.max >= 0)) {
        throw new Error(`${where}: max of "${value}" must be an integer ≥ 0.`)
      }
      if (policy.then !== undefined && !channel.values.includes(policy.then)) {
        throw new Error(`${where}: then "${policy.then}" of "${value}" is not in values.`)
      }
    }
  }
  return channels
}

type Requested = { value: string; level?: number }

/* -------------------------------------------------------------------------- */
/* Counting                                                                   */
/* -------------------------------------------------------------------------- */

type Counter = { last?: string; streak: number; counts: Map<string, number> }

function cuesOf(message: Message): StoredCues | undefined {
  if (message.role !== 'assistant') return undefined
  const part = message.parts.find((p): p is DataPart => p.type === 'data' && p.name === CUES_PART)
  return part && typeof part.value === 'object' && part.value !== null ? (part.value as StoredCues) : undefined
}

function emptyCounters(names: string[]): Map<string, Counter> {
  return new Map(names.map((name) => [name, { streak: 0, counts: new Map() }]))
}

function count(counters: Map<string, Counter>, stored: StoredCues) {
  for (const [name, counter] of counters) {
    const entry = stored[name]
    if (!entry) continue
    counter.streak = counter.last === entry.value ? counter.streak + 1 : 1
    counter.last = entry.value
    counter.counts.set(entry.value, (counter.counts.get(entry.value) ?? 0) + 1)
  }
}

/** Decides one channel for one message, from what was asked and what came before. */
function decide(
  channel: CueChannel,
  counter: Counter,
  asked: { value: string; from: CueFrom; level?: number },
): { stored: StoredCues[string]; streak: number; count: number; crossed: boolean } {
  let { value, from } = asked
  let requested: string | undefined
  const occurrences = (v: string, by: RepeatPolicy['by']) =>
    by === 'count' ? (counter.counts.get(v) ?? 0) + 1 : counter.last === v ? counter.streak + 1 : 1
  const policy = channel.repeat?.[value]
  if (policy?.max !== undefined && occurrences(value, policy.by) > policy.max) {
    const replacement = policy.then ?? channel.default
    if (replacement !== value) {
      requested = value
      value = replacement
      from = 'repeat'
    }
  }
  const levels = channel.repeat?.[value]?.levels ?? []
  const n = occurrences(value, channel.repeat?.[value]?.by)
  let level = 1 + levels.filter((t) => n >= t).length
  if (asked.level !== undefined && from === 'backend') level = Math.min(Math.max(1, Math.round(asked.level)), levels.length + 1)
  return {
    stored: { value, level, from, ...(requested ? { requested } : {}) },
    streak: counter.last === value ? counter.streak + 1 : 1,
    count: (counter.counts.get(value) ?? 0) + 1,
    crossed: levels.includes(n),
  }
}

/* -------------------------------------------------------------------------- */
/* Rules                                                                      */
/* -------------------------------------------------------------------------- */

function matches(condition: CueCondition, context: CueRuleContext, classify: (s: SourcePart) => readonly string[]): boolean {
  if (condition.source) {
    const { urlPrefix, trail, title, taxonomy } = condition.source
    const hit = context.sources.some(
      (s) =>
        (urlPrefix === undefined || (s.url ?? '').startsWith(urlPrefix)) &&
        (trail === undefined || (s.trail ?? []).includes(trail)) &&
        (title === undefined || s.title.includes(title)) &&
        (taxonomy === undefined || classify(s).includes(taxonomy)),
    )
    if (!hit) return false
  }
  if (condition.taxonomy !== undefined && !context.taxonomies.has(condition.taxonomy)) return false
  if (condition.action !== undefined && !context.actions.some((a) => a.name === condition.action)) return false
  if (condition.event === 'error' && !context.errors.length) return false
  if (condition.event === 'action.failed' && !context.actions.some((a) => a.error)) return false
  if (condition.event === 'interrupted' && !context.interrupted) return false
  if (condition.trigger !== undefined && context.trigger?.modality !== condition.trigger) return false
  if (condition.text) {
    condition.text.lastIndex = 0
    if (!condition.text.test(context.text)) return false
  }
  return true
}

/* -------------------------------------------------------------------------- */
/* Plugin                                                                     */
/* -------------------------------------------------------------------------- */

type TurnInfo = {
  trigger?: Signal
  actions: Array<{ name: string; origin: string; error?: string }>
  errors: string[]
  /** Values asked by the backend, waiting for the message they belong to. */
  asked: Record<string, Requested>
  /** Message the backend named, if any. */
  messageId?: string
}

const definition: PluginDefinition<CuesOptions> = {
  name: 'cues',
  provides: ['cues'],
  apply(ctx, options) {
    const channels = checkChannels(options.channels)
    const names = Object.keys(channels)
    const rules = (options.rules ?? []).map((rule, index) => ({ ...rule, index }))
    const actionName = typeof options.action === 'string' ? options.action : 'set_cues'
    const app = ctx.app
    const report = (error: unknown) => ctx.emit('error', { error, source: 'cues' })
    const classify = (source: SourcePart): readonly string[] => {
      if (!options.classify) return []
      try {
        const result = options.classify(source)
        return Array.isArray(result) ? result : []
      } catch (error) {
        report(error)
        return []
      }
    }

    const turns = new Map<string, TurnInfo>()
    let currentTurn: string | undefined
    const turn = (turnId: string): TurnInfo => {
      let info = turns.get(turnId)
      if (!info) turns.set(turnId, (info = { actions: [], errors: [], asked: {} }))
      return info
    }

    /** Validates `{ channel: value | { value, level } }`; unknown channels and values are reported. */
    const read = (input: unknown): Record<string, Requested> => {
      const out: Record<string, Requested> = {}
      if (typeof input !== 'object' || input === null) {
        report(new Error('Cues must be an object of channel → value.'))
        return out
      }
      for (const [name, raw] of Object.entries(input)) {
        if (name === 'messageId') continue
        const channel = channels[name]
        if (!channel) {
          report(new Error(`Unknown cue channel "${name}" was dropped.`))
          continue
        }
        const value = typeof raw === 'string' ? raw : typeof raw === 'object' && raw ? (raw as Requested).value : undefined
        const level = typeof raw === 'object' && raw && typeof (raw as Requested).level === 'number' ? (raw as Requested).level : undefined
        if (typeof value !== 'string' || !channel.values.includes(value)) {
          report(new Error(`Cue "${String(value)}" is not a value of "${name}"; using "${channel.default}".`))
          out[name] = { value: channel.default }
          continue
        }
        out[name] = level === undefined || !Number.isFinite(level) ? { value } : { value, level }
      }
      return out
    }

    /* ---------------------------------------------------------------- */
    /* State                                                            */
    /* ---------------------------------------------------------------- */

    const initial = (): Record<string, CueState> =>
      Object.fromEntries(names.map((name) => [name, { value: channels[name]!.default, streak: 0, count: 0, level: 1, from: 'default' as CueFrom }]))
    let state: CuesState = initial()
    let known: StoredCues[] = []
    /** Backend values shown before their message is stored. */
    let overlay: Record<string, CueState> = {}
    const listeners = new Set<() => void>()

    /** Counters from the stored cues of the messages before `index` (all when absent). */
    const countersBefore = (messages: Message[], index = messages.length) => {
      const counters = emptyCounters(names)
      for (let i = 0; i < index; i++) {
        const stored = cuesOf(messages[i]!)
        if (stored) count(counters, stored)
      }
      return counters
    }

    const replay = (messages: Message[], skip?: ReadonlySet<string>): Record<string, CueState> => {
      const next = initial()
      const counters = emptyCounters(names)
      for (const message of messages) {
        const stored = cuesOf(message)
        if (!stored || skip?.has(message.id)) continue
        count(counters, stored)
        for (const name of names) {
          const entry = stored[name]
          const counter = counters.get(name)!
          if (!entry) continue
          next[name] = {
            value: entry.value,
            previous: next[name]!.messageId ? next[name]!.value : undefined,
            streak: counter.streak,
            count: counter.counts.get(entry.value) ?? 0,
            level: entry.level,
            from: entry.from,
            ...(entry.requested ? { requested: entry.requested } : {}),
            messageId: message.id,
          }
          if (next[name]!.previous === undefined) delete next[name]!.previous
        }
      }
      return next
    }

    const same = (a: CueState | undefined, b: CueState) =>
      !!a &&
      a.value === b.value &&
      a.level === b.level &&
      a.streak === b.streak &&
      a.count === b.count &&
      a.from === b.from &&
      a.messageId === b.messageId &&
      a.requested === b.requested &&
      a.pending === b.pending

    /* Speech sync: replies the voice will speak wait for their first chunk. */
    const speechSync = options.sync !== 'arrival'
    const held = new Set<string>()
    const heldTurns = new Set<string>()
    let overlayTurn: string | undefined
    const voice = () => (speechSync ? (app.get('voice' as keyof Services) as unknown as VoiceLike | undefined) : undefined)
    const turnOf = (messageId: string) => app.conversation.find(messageId)?.turnId
    const releaseTurn = (turnId: string | undefined) => {
      if (!turnId) return
      for (const id of held) if (turnOf(id) === turnId) return
      heldTurns.delete(turnId)
    }
    const release = (messageId: string) => {
      if (!held.delete(messageId)) return
      releaseTurn(turnOf(messageId))
      publish()
    }
    const releaseAll = () => {
      if (!held.size && !heldTurns.size) return
      held.clear()
      heldTurns.clear()
      publish()
    }

    /** What was decided, spoken or not (for the backend). */
    const actual = (): Record<string, CueState> => ({ ...replay(app.messages), ...overlay })

    const publish = () => {
      const base = replay(app.messages, held)
      const next: Record<string, CueState> = { ...base, ...(overlayTurn && heldTurns.has(overlayTurn) ? {} : overlay) }
      const changed = names.filter((name) => !same(state[name], next[name]!))
      if (!changed.length) return
      state = Object.freeze(next)
      for (const name of changed) ctx.emit('cue.changed', { channel: name, ...state[name]! })
      for (const listener of listeners) {
        try {
          listener()
        } catch (error) {
          report(error)
        }
      }
    }

    /* ---------------------------------------------------------------- */
    /* Deciding a message                                               */
    /* ---------------------------------------------------------------- */

    const eligible = (message: AssistantMessage, info: TurnInfo | undefined) =>
      textOf(message).trim().length > 0 || (info?.messageId === message.id && Object.keys(info.asked).length > 0)

    const contextFor = (message: AssistantMessage, info: TurnInfo | undefined): CueRuleContext => {
      const sources = message.parts.filter((p): p is SourcePart => p.type === 'source')
      return {
        message,
        text: textOf(message),
        sources,
        taxonomies: new Set(sources.flatMap((s) => classify(s))),
        actions: info?.actions ?? [],
        errors: info?.errors ?? [],
        interrupted: !!message.interrupted,
        trigger: info?.trigger,
      }
    }

    const fromRules = (context: CueRuleContext): Record<string, string> => {
      const chosen: Record<string, { value: string; priority: number; index: number }> = {}
      for (const rule of rules) {
        let hit = false
        try {
          hit = typeof rule.when === 'function' ? !!rule.when(context) : matches(rule.when, context, classify)
        } catch (error) {
          report(error)
        }
        if (!hit) continue
        const priority = rule.priority ?? 0
        for (const [name, value] of Object.entries(rule.set)) {
          const channel = channels[name]
          if (!channel || !channel.values.includes(value)) {
            report(new Error(`Rule sets "${name}" to "${value}", which is not declared; ignored.`))
            continue
          }
          const current = chosen[name]
          if (!current || priority >= current.priority) chosen[name] = { value, priority, index: rule.index }
        }
      }
      return Object.fromEntries(Object.entries(chosen).map(([name, c]) => [name, c.value]))
    }

    /** Decides and stores the cues of an assistant message. */
    const settle = (messageId: string) => {
      const messages = app.messages
      const index = messages.findIndex((m) => m.id === messageId)
      const message = messages[index]
      if (!message || message.role !== 'assistant') return
      const info = message.turnId ? turns.get(message.turnId) : undefined
      const named = info?.messageId === undefined || info.messageId === message.id
      if (!eligible(message, info)) return
      const asked = named ? (info?.asked ?? {}) : {}
      const fromBackend = Object.keys(asked).length > 0
      const previous = cuesOf(message)
      // Already settled and nothing new from the backend: keep it (rules never rerun on old messages).
      if (previous && !fromBackend) return
      let ruled: Record<string, string> = {}
      try {
        ruled = previous ? {} : fromRules(contextFor(message, info))
      } catch (error) {
        report(error)
      }
      const counters = countersBefore(messages, index)
      const stored: StoredCues = {}
      for (const name of names) {
        const channel = channels[name]!
        const counter = counters.get(name)!
        const prior = previous?.[name]
        if (prior && !asked[name]) {
          stored[name] = prior
          continue
        }
        const choice: { value: string; from: CueFrom; level?: number } = asked[name]
          ? { value: asked[name]!.value, from: 'backend', level: asked[name]!.level }
          : ruled[name]
              ? { value: ruled[name]!, from: 'rule' }
              : channel.persist === 'sticky' && counter.last !== undefined
                ? { value: counter.last, from: 'sticky' }
                : { value: channel.default, from: 'default' }
        const result = decide(channel, counter, choice)
        stored[name] = result.stored
        if (result.stored.requested || result.crossed) {
          ctx.emit('cue.repeat', {
            channel: name,
            value: result.stored.value,
            level: result.stored.level,
            streak: result.streak,
            count: result.count,
            ...(result.stored.requested ? { replaced: result.stored.requested } : {}),
            messageId: message.id,
          })
        }
      }
      if (named && info) {
        info.asked = {}
        info.messageId = undefined
      }
      overlay = {}
      app.conversation.update<AssistantMessage>(message.id, (m) => {
        const part: DataPart = { type: 'data', name: CUES_PART, value: stored }
        const at = m.parts.findIndex((p) => p.type === 'data' && p.name === CUES_PART)
        return { ...m, parts: at < 0 ? [...m.parts, part] : m.parts.with(at, part) }
      })
    }

    /** Shows backend values right away, before the message is stored. */
    const preview = (turnId: string) => {
      const info = turns.get(turnId)
      if (!info) return
      const messages = app.messages
      const target = info.messageId
        ? messages.findIndex((m) => m.id === info.messageId)
        : messages.findLastIndex((m) => m.role === 'assistant' && m.turnId === turnId && !cuesOf(m))
      const counters = countersBefore(messages, target < 0 ? messages.length : target)
      const next: Record<string, CueState> = {}
      for (const [name, asked] of Object.entries(info.asked)) {
        const result = decide(channels[name]!, counters.get(name)!, { value: asked.value, from: 'backend', level: asked.level })
        next[name] = {
          ...result.stored,
          previous: counters.get(name)!.last,
          streak: result.streak,
          count: result.count,
          messageId: target < 0 ? undefined : messages[target]!.id,
          pending: true,
        }
        if (next[name]!.previous === undefined) delete next[name]!.previous
        if (next[name]!.messageId === undefined) delete next[name]!.messageId
      }
      overlay = next
      overlayTurn = turnId
      if (voice()?.willSpeakReplies?.()) heldTurns.add(turnId)
      publish()
    }

    const ask = (turnId: string | undefined, input: unknown): Record<string, Requested> => {
      const values = read(input)
      if (!turnId || !Object.keys(values).length) return values
      const info = turn(turnId)
      const messageId = typeof (input as { messageId?: unknown })?.messageId === 'string' ? (input as { messageId: string }).messageId : undefined
      if (messageId) info.messageId = messageId
      Object.assign(info.asked, values)
      // A message the backend named that was already stored: decide it again now.
      const target = messageId && app.messages.find((m) => m.id === messageId)
      if (target && cuesOf(target)) settle(messageId!)
      else preview(turnId)
      return values
    }

    const finishTurn = (turnId: string) => {
      for (const message of app.messages) {
        if (message.role === 'assistant' && message.turnId === turnId && !cuesOf(message)) settle(message.id)
      }
      turns.delete(turnId)
      if (currentTurn === turnId) currentTurn = undefined
      overlay = {}
      releaseTurn(turnId)
      publish()
    }

    /* ---------------------------------------------------------------- */
    /* Wiring                                                           */
    /* ---------------------------------------------------------------- */

    ctx.on('turn.status', (status) => {
      if (status.phase === 'received' || status.phase === 'acting') {
        currentTurn = status.turnId
        const info = turn(status.turnId)
        if (status.signal) info.trigger = status.signal
      } else {
        finishTurn(status.turnId)
      }
    })
    ctx.on('action.invoked', (invocation) => {
      if (!currentTurn || invocation.name === actionName) return
      turn(currentTurn).actions.push({ name: invocation.name, origin: invocation.origin, ...(invocation.error ? { error: invocation.error } : {}) })
    })
    ctx.on('error', ({ source }) => {
      if (currentTurn && source !== 'cues') turn(currentTurn).errors.push(source)
    })
    ctx.on('stimulus', ({ turnId, stimulus }) => {
      if (stimulus.type === 'ui.effect' && stimulus.name === CUES_PART) ask(turnId, stimulus.value)
      else if (stimulus.type === 'message.end') settle(stimulus.messageId)
    })
    if (speechSync) {
      const onPlugin = ctx.on.bind(ctx) as unknown as <P>(event: string, listener: (payload: P) => void) => () => void
      onPlugin<VoiceTrack>('voice.track', ({ messageId, speak }) => {
        const turnId = turnOf(messageId)
        if (speak) {
          held.add(messageId)
          if (turnId) heldTurns.add(turnId)
          publish()
        } else if (turnId && heldTurns.has(turnId)) {
          releaseTurn(turnId)
          publish()
        }
      })
      // Started, ended, failed or skipped: the reply reached (or will never reach) the speakers.
      onPlugin<VoiceSpeech>('voice.speech', ({ messageId }) => {
        if (messageId) release(messageId)
      })
      ctx.on('turn.interrupted', releaseAll)
      ctx.on('service.removed', ({ key }) => {
        if (key === ('voice' as keyof Services)) releaseAll()
      })
    }
    ctx.on('messages.changed', (messages) => {
      if (held.size) {
        const ids = new Set(messages.map((m) => m.id))
        for (const id of held) if (!ids.has(id)) held.delete(id)
        if (!held.size) heldTurns.clear()
      }
      const stored = messages.map(cuesOf).filter((c): c is StoredCues => !!c)
      if (stored.length === known.length && stored.every((c, i) => c === known[i])) return
      known = stored
      publish()
    })

    if (options.action !== false) {
      const properties = Object.fromEntries(
        names.map((name) => [
          name,
          { type: 'string', enum: [...channels[name]!.values], ...(channels[name]!.description ? { description: channels[name]!.description } : {}) },
        ]),
      )
      ctx.registerAction({
        name: actionName,
        description: 'Sets presentation cues for the reply (for example the tone). Use only the listed values.',
        parameters: { type: 'object', properties, additionalProperties: false },
        confirm: 'never',
        exposeTo: ['assistant', 'agent'],
        handler: (args: unknown) => {
          const values = ask(currentTurn, args)
          const now = actual()
          return Object.fromEntries(Object.keys(values).map((name) => [name, { ...now[name]! }]))
        },
      })
    }

    if (options.report) {
      ctx.intercept('request.before', (request) => {
        const now = actual()
        const value = Object.fromEntries(
          names.map((name) => {
            const s = now[name]!
            return [name, { value: s.value, streak: s.streak, count: s.count, level: s.level, ...(s.requested ? { requested: s.requested } : {}) }]
          }),
        )
        const signal: Signal = {
          id: 'cues-state',
          kind: 'context',
          key: CUES_CONTEXT_KEY,
          modality: 'text',
          source: 'cues',
          parts: [{ type: 'data', name: CUES_CONTEXT_KEY, value }],
          timestamp: Date.now(),
        }
        return { ...request, context: [...request.context.filter((s) => s.key !== CUES_CONTEXT_KEY), signal] }
      })
    }

    const control: CuesControl = {
      getState: () => state,
      subscribe(listener) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
      channels,
      schema: () => ({
        type: 'object',
        properties: Object.fromEntries(names.map((name) => [name, { type: 'string', enum: [...channels[name]!.values] }])),
        additionalProperties: false,
      }),
    }
    ctx.provide('cues', control)
    known = app.messages.map(cuesOf).filter((c): c is StoredCues => !!c)
    publish()
  },
}

/**
 * Cues (ADR 0018): presentation categories with a closed vocabulary, set by
 * the backend (`ui.effect` named `cues` or the `set_cues` action) or by rules
 * tied to the content, counted per value and limited by repetition policies.
 * Stored in each assistant message; the page decides what each value means.
 */
export const cues = definePlugin<CuesOptions>(definition)
