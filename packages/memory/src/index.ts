// Type-only imports: @handsforbots/core mounts this plugin by default, so it
// can't import the kernel at runtime.
import type { Message, Plugin, PluginDefinition, Signal, TurnRequest } from '@handsforbots/core'

/**
 * Summarizes turns that left the window. Receives the previous summary and
 * the turns to fold in (oldest first); returns the new summary.
 */
export type Summarizer = (input: { previous?: string; turns: Message[][] }) => string | Promise<string>

export type MemoryOptions = {
  /** Turns sent to the assistant with each request: a number, 'all', or 'none' (only the current turn; the backend remembers). Default 20. */
  send?: number | 'all' | 'none'
  /** Turns kept in the history (and so in storage). Never fewer than `send`. Default 100; 'all' keeps everything. */
  keep?: number | 'all'
  /**
   * Turns that leave the `send` window are folded into a summary sent as the
   * context signal `memory.summary`. 'local' (default) builds it without an
   * LLM; pass a `Summarizer` (e.g. `httpSummarizer`) to use one; false drops them.
   */
  compact?: 'local' | false | Summarizer
  /** Maximum summary length in characters (oldest lines go first). Default 4000. */
  maxSummaryChars?: number
}

/** Stored in `SessionSnapshot.memory`. */
export type MemoryState = {
  summary?: string
  /** Id of the last message folded into the summary. */
  through?: string
}

/** The `memory` service. */
export type MemoryControl = {
  readonly options: Readonly<Required<Omit<MemoryOptions, 'compact'>>> & { compact: MemoryOptions['compact'] }
  /** Summary of the turns that left the window, if any. */
  readonly summary: string | undefined
  /** The messages and context that would be sent for a request. */
  view(request: TurnRequest): TurnRequest
  /** Compacts and trims now (it also runs after every job). */
  maintain(): Promise<void>
}

declare module '@handsforbots/core' {
  interface Services {
    memory: MemoryControl
  }
  interface Events {
    /** The memory summary changed or old turns were removed. */
    'memory.changed': { summary?: string; removed: number }
  }
}

const SUMMARY_KEY = 'memory.summary'

const definition: PluginDefinition<MemoryOptions | undefined> = {
  name: 'memory',
  provides: ['memory'],
  apply(ctx, options = {}) {
    const send = typeof options.send === 'number' ? Math.max(1, Math.floor(options.send)) : (options.send ?? 20)
    const keepOption = options.keep ?? 100
    const keep = keepOption === 'all' || typeof send !== 'number' ? keepOption : Math.max(keepOption, send)
    const compact = options.compact ?? 'local'
    const maxChars = options.maxSummaryChars ?? 4000
    const conversation = ctx.app.conversation
    const state = (): MemoryState => (conversation.memory as MemoryState | undefined) ?? {}

    const view = (request: TurnRequest): TurnRequest => {
      const { summary, through } = state()
      let messages = request.messages
      if (send === 'none') messages = messages.filter((m) => m.turnId === request.turnId)
      else if (send !== 'all') {
        const turns = groupTurns(messages)
        // Turns not in the summary yet are never left out (maintain() runs before each request, so normally there are none).
        const pending = compact ? turnsAfter(turns, through) : []
        messages = (pending.length > send ? pending : turns.slice(-send)).flat()
      }
      const context: Signal[] = summary
        ? [
            ...request.context.filter((s) => s.key !== SUMMARY_KEY),
            {
              id: 'memory-summary',
              kind: 'context',
              key: SUMMARY_KEY,
              modality: 'text',
              source: 'memory',
              parts: [{ type: 'text', text: `Summary of earlier turns in this conversation:\n${summary}` }],
              timestamp: Date.now(),
            },
          ]
        : request.context
      return { ...request, messages, context }
    }

    let running: Promise<void> | undefined
    let again = false
    const maintain = async (): Promise<void> => {
      if (running) {
        again = true
        return running
      }
      running = (async () => {
        do {
          again = false
          await step()
        } while (again && !ctx.isDisposed)
      })().finally(() => (running = undefined))
      return running
    }

    const step = async () => {
      const threadId = conversation.threadId
      let { summary, through } = state()
      let changed = false

      if (compact && typeof send === 'number') {
        const pending = turnsAfter(groupTurns(conversation.messages), through)
        const leaving = pending.slice(0, Math.max(0, pending.length - send))
        if (leaving.length > 0) {
          let next: string
          try {
            next = compact === 'local' ? localSummary(summary, leaving) : await compact({ previous: summary, turns: leaving })
          } catch (error) {
            ctx.emit('error', { error, source: 'memory' })
            next = localSummary(summary, leaving)
          }
          if (ctx.isDisposed || conversation.threadId !== threadId) return // reset meanwhile
          summary = truncate(next, maxChars)
          through = leaving.at(-1)!.at(-1)!.id
          changed = true
        }
      }

      let removed = 0
      if (typeof keep === 'number') {
        const turns = groupTurns(conversation.messages)
        // With compaction, only turns already in the summary may go.
        const removable = compact && typeof send === 'number' ? turns.length - turnsAfter(turns, through).length : turns.length
        const drop = turns.slice(0, Math.min(Math.max(0, turns.length - keep), removable))
        const ids = new Set(drop.flat().map((m) => m.id))
        removed = ids.size
        if (removed > 0) changed = true
        if (changed) {
          conversation.restore({
            ...conversation.snapshot(),
            messages: conversation.messages.filter((m) => !ids.has(m.id)),
            memory: { summary, through } satisfies MemoryState,
          })
        }
      } else if (changed) {
        conversation.memory = { summary, through } satisfies MemoryState
      }
      if (!changed) return
      ctx.emit('memory.changed', { summary, removed })
      // The kernel already saved at the end of the job; save the result of this pass too.
      if (!ctx.app.busy) {
        try {
          await ctx.app.get('storage')?.save(conversation.snapshot())
        } catch (error) {
          ctx.emit('error', { error, source: 'storage' })
        }
      }
    }

    // Bring the summary up to date first, so turns leaving the window are never just dropped.
    ctx.intercept(
      'request.before',
      async (request) => {
        await maintain()
        return view(request)
      },
      -100,
    )
    ctx.on('turn.status', ({ phase }) => {
      if (phase !== 'done' && phase !== 'error' && phase !== 'aborted') return
      // Let the kernel finish the job (and save) first.
      setTimeout(() => !ctx.isDisposed && void maintain(), 0)
    })
    ctx.provide('memory', {
      options: { send, keep, compact, maxSummaryChars: maxChars },
      get summary() {
        return state().summary
      },
      view,
      maintain,
    })
  },
}

/** The memory plugin. `@handsforbots/core` mounts `memory()` unless you pass your own or `createH4B({ memory: false })`. */
export function memory(options?: MemoryOptions): Plugin<MemoryOptions | undefined> {
  return { definition, config: options }
}

/**
 * Turns, oldest first: messages grouped by `turnId` (the job that added them).
 * Messages saved before `turnId` existed start a turn at each user message.
 */
export function groupTurns(messages: Message[]): Message[][] {
  const turns: Message[][] = []
  let last: Message | undefined
  for (const message of messages) {
    const sameTurn =
      last && (message.turnId || last.turnId ? message.turnId === last.turnId : message.role !== 'user')
    if (sameTurn) turns.at(-1)!.push(message)
    else turns.push([message])
    last = message
  }
  return turns
}

/** Turns after the one that holds `through` (all of them if it is gone or unset). */
function turnsAfter(turns: Message[][], through: string | undefined): Message[][] {
  if (!through) return turns
  const index = turns.findIndex((turn) => turn.some((m) => m.id === through))
  return index < 0 ? turns : turns.slice(index + 1)
}

/** A summary without an LLM: one line per message, actions with their outcome. */
export function localSummary(previous: string | undefined, turns: Message[][]): string {
  const lines: string[] = previous ? [previous] : []
  for (const message of turns.flat()) {
    if (message.role === 'tool') {
      lines.push(`  → ${message.name}: ${message.error ? `error: ${clip(message.error, 120)}` : `ok${brief(message.result)}`}`)
      continue
    }
    const text = message.parts
      .map((p) => (p.type === 'text' ? p.text : p.type === 'data' ? (p.name === 'ui' ? '' : `[${p.name}]`) : `[${p.type}]`))
      .filter(Boolean)
      .join(' ')
      .trim()
    const who = message.role === 'user' ? 'User' : 'Assistant'
    if (text) lines.push(`${who}: ${clip(text, 300)}`)
    if (message.role === 'assistant') {
      for (const call of message.toolCalls ?? []) lines.push(`Action ${call.name}(${clip(json(call.args), 120)})`)
    }
  }
  return lines.join('\n')
}

export type HttpSummarizerOptions = {
  /** Your endpoint: receives `{ previous, messages }` and answers `{ summary }`. */
  url: string
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  credentials?: RequestCredentials
  fetch?: typeof fetch
}

/** A `Summarizer` that asks your backend (which calls an LLM with its own keys). */
export function httpSummarizer(options: HttpSummarizerOptions): Summarizer {
  return async ({ previous, turns }) => {
    const doFetch = options.fetch ?? globalThis.fetch
    const headers = typeof options.headers === 'function' ? await options.headers() : options.headers
    const response = await doFetch(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      credentials: options.credentials ?? 'same-origin',
      body: JSON.stringify({ previous, messages: turns.flat() }),
    })
    if (!response.ok) throw new Error(`[h4b] httpSummarizer: ${response.status} from ${options.url}`)
    const { summary } = (await response.json()) as { summary?: unknown }
    if (typeof summary !== 'string') throw new Error('[h4b] httpSummarizer: the response has no "summary" string')
    return summary
  }
}

function truncate(summary: string, max: number): string {
  if (summary.length <= max) return summary
  const tail = summary.slice(summary.length - max + 2)
  const cut = tail.indexOf('\n')
  return `…\n${cut >= 0 ? tail.slice(cut + 1) : tail}`
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}) ?? ''
  } catch {
    return '?'
  }
}

function brief(result: unknown): string {
  if (result === undefined || result === null) return ''
  const text = typeof result === 'string' ? result : json(result)
  return text.length <= 80 ? ` (${text})` : ''
}
