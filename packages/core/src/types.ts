import type { ConversationAttributes } from './attributes.js'
import type { StandardSchemaV1 } from './standard-schema.js'

/* -------------------------------------------------------------------------- */
/* Parts                                                                      */
/* -------------------------------------------------------------------------- */

/** Binary or remote media: either inline data (Blob / base64) or a URL. */
export type MediaSource =
  | { kind: 'blob'; blob: Blob }
  | { kind: 'base64'; data: string }
  | { kind: 'url'; url: string }

export type TextPart = {
  type: 'text'
  text: string
  /** Spans of `text` backed by sources of the same message (ADR 0014). */
  citations?: Citation[]
}
export type MediaPart = {
  type: 'image' | 'audio' | 'video' | 'file'
  mimeType: string
  source: MediaSource
  name?: string
}
/** Structured data: sensor readings, GUI events, quick replies, etc. */
export type DataPart = { type: 'data'; name: string; value: unknown }

/**
 * Where information in an assistant message came from (ADR 0014). Sources
 * with the same `id` in one message replace each other. A source no citation
 * points to was consulted; one a citation points to was cited.
 */
export type SourcePart = {
  type: 'source'
  /** Unique within the message; citations refer to it. */
  id: string
  /** Plain text, never HTML. */
  title: string
  /** Path of headings down to the excerpt, plain text. */
  trail?: string[]
  /**
   * Absolute `http(s)` URL or a same-page anchor (`#section`). Relative paths
   * are not allowed; renderers drop any other value (`safeSourceUrl`). Without
   * a URL the source is a text-only reference.
   */
  url?: string
  /** The passage used, plain text, never HTML. */
  excerpt?: string
}

/**
 * A span of a text part backed by one or more sources (ADR 0014). Positions
 * are UTF-16 code units (JavaScript string indexes) into that part's `text`;
 * transports convert other units (such as Gemini's bytes). `start === end`
 * cites a point: renderers place the reference there.
 */
export type Citation = {
  /** Inclusive. */
  start: number
  /** Exclusive. Renderers place the reference here. */
  end: number
  /** `id`s of `source` parts of the same message. */
  sourceIds: string[]
}

export type Part = TextPart | MediaPart | DataPart | SourcePart

/* -------------------------------------------------------------------------- */
/* Signals (input)                                                            */
/* -------------------------------------------------------------------------- */

export type Modality =
  | 'text'
  | 'audio'
  | 'transcript'
  | 'image'
  | 'video'
  | 'file'
  | 'sensor'
  | 'gui-event'
  | 'command'

/**
 * Anything that enters H4B. A `trigger` starts a turn; a `context` signal is
 * kept and attached to the next turns until replaced or removed.
 */
export type Signal = {
  id: string
  kind: 'trigger' | 'context'
  modality: Modality
  parts: Part[]
  /** Plugin (or host) that produced the signal. */
  source: string
  /** Context signals with the same key replace each other. Defaults to `source`. */
  key?: string
  /**
   * Context signal sent with one turn only: removed once a request that
   * carried it reaches the transport (ADR 0015). For news about what just
   * happened, such as an interruption, rather than for what is on screen.
   */
  once?: boolean
  meta?: Record<string, unknown>
  timestamp: number
  /**
   * What to do if this trigger arrives while the kernel is busy, overriding
   * the kernel's input policy (`H4BOptions.input`).
   */
  whileBusy?: WhileBusy
}

/**
 * What a conversational trigger (`text`, `transcript`, `audio`) does when it
 * arrives while the kernel is busy (ADR 0011).
 * - `queue`: waits for the running turn and for what is already queued.
 * - `interrupt`: cancels the reply in progress and becomes the next turn.
 * - `merge`: joins a trigger that was not answered yet; otherwise waits.
 *
 * With `interrupt` and `merge`, a running turn that has produced no output
 * yet is resumed: aborted and run again with both inputs as one message.
 */
export type WhileBusy = 'queue' | 'interrupt' | 'merge'

export type SignalInput = Omit<Signal, 'id' | 'timestamp' | 'kind'> & {
  id?: string
  kind?: Signal['kind']
  timestamp?: number
}

/* -------------------------------------------------------------------------- */
/* Messages (history)                                                         */
/* -------------------------------------------------------------------------- */

/** How a turn was resolved: by a direct command (menu) or by a transport. */
/** How a turn was resolved. `agent`: an external agent (e.g. via WebMCP) ran an action. */
export type Route = 'direct' | 'transport' | 'capture' | 'push' | 'agent'

export type ToolCall = { id: string; name: string; args: unknown }

export type UserMessage = {
  id: string
  role: 'user'
  /** The turn (job: turn, action or push) that added it. Absent in messages saved before it existed. */
  turnId?: string
  parts: Part[]
  modality: Modality
  source: string
  /** Signal that produced this message. */
  signalId?: string
  route?: Route
  createdAt: number
}

export type AssistantMessage = {
  id: string
  role: 'assistant'
  /** The turn (job: turn, action or push) that added it. Absent in messages saved before it existed. */
  turnId?: string
  parts: Part[]
  toolCalls?: ToolCall[]
  route?: Route
  /** True while text is still streaming. */
  streaming?: boolean
  /** Cut short by `h4b.interrupt()`: the text holds only what was shown or spoken. */
  interrupted?: boolean
  createdAt: number
}

export type ToolMessage = {
  id: string
  role: 'tool'
  /** The turn (job: turn, action or push) that added it. Absent in messages saved before it existed. */
  turnId?: string
  toolCallId: string
  name: string
  result?: unknown
  error?: string
  route?: Route
  createdAt: number
}

export type Message = UserMessage | AssistantMessage | ToolMessage

/* -------------------------------------------------------------------------- */
/* Stimuli (output)                                                           */
/* -------------------------------------------------------------------------- */

export type Stimulus =
  | { type: 'message.start'; messageId: string }
  | { type: 'message.delta'; messageId: string; delta: string }
  /** Adds a part. A `source` part replaces the one with the same `id` in the message. */
  | { type: 'message.part'; messageId: string; part: Part }
  /** Adds citations to the message's last text part; positions are into that part (ADR 0014). */
  | { type: 'message.citations'; messageId: string; citations: Citation[] }
  | { type: 'message.end'; messageId: string }
  /** The backend asks the client to run a registered action (frontend tool). */
  | { type: 'action.call'; callId: string; name: string; args: unknown; messageId?: string }
  /** A tool already executed by the backend; recorded for display and history. */
  | { type: 'action.result'; callId: string; name?: string; result: unknown }
  /**
   * Rich content. Without a slot (or slot 'message') it becomes part of the
   * assistant message (`data` part named 'ui', kept in history); other slots are
   * for the host to place elsewhere on the page.
   */
  | { type: 'ui.render'; slot?: string; component: string; props?: unknown; messageId?: string }
  | { type: 'ui.effect'; name: string; value?: unknown }
  | { type: 'state.snapshot'; state: unknown }
  | { type: 'state.patch'; patch: JsonPatchOperation[] }
  | { type: 'audio'; part: MediaPart }
  | { type: 'custom'; name: string; value: unknown }
  | { type: 'error'; message: string; code?: string }

export type JsonPatchOperation = {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
  path: string
  from?: string
  value?: unknown
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

/** Who asked for an action. Trust: user > assistant > agent. */
export type Origin = 'user' | 'assistant' | 'agent'

export type ConfirmPolicy = 'never' | 'destructive' | 'always'

export type ActionDefinition<I = any, O = unknown> = {
  name: string
  description: string
  /** Validates arguments (Zod, Valibot, ArkType…). */
  input?: StandardSchemaV1<unknown, I>
  /** JSON Schema sent to LLMs. Derived from `input` when it supports Standard JSON Schema. */
  parameters?: Record<string, unknown>
  handler: (args: I, call: ActionCallContext) => O | Promise<O>
  /** Default `'destructive'`: confirm only when `destructive` is true. */
  confirm?: ConfirmPolicy
  destructive?: boolean
  /** Origins allowed to call it. Default: all. */
  exposeTo?: Origin[]
  /** Does not change anything (lets agents call it more freely). */
  readOnly?: boolean
  /** Short sentence used when the action runs as a direct command. */
  describeResult?: (result: O, args: I) => string | undefined
}

export type ActionCallContext = {
  origin: Origin
  callId: string
  signal?: AbortSignal
  /** Shows rich content (e.g. a gallery) in the reply that triggered the action. */
  render?: (component: string, props?: unknown) => void
}

export type ActionDescriptor = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ConfirmRequest = {
  action: string
  description: string
  args: unknown
  origin: Origin
}

export type Confirmer = (request: ConfirmRequest) => Promise<boolean>

/* -------------------------------------------------------------------------- */
/* Transports                                                                 */
/* -------------------------------------------------------------------------- */

export type TurnRequest = {
  threadId: string
  turnId: string
  /** Full history, including the user message of this turn. */
  messages: Message[]
  /** Context signals currently held by the kernel. */
  context: Signal[]
  /** Actions the assistant may call. */
  actions: ActionDescriptor[]
  state?: unknown
}

export type TransportCapabilities = {
  streaming?: boolean
  /** Supports client-side tool calls (action.call). */
  tools?: boolean
  /** Consumes audio directly (realtime speech-to-speech). */
  audio?: boolean
  /** Accepted media types in user parts, e.g. ['image/*']. */
  media?: string[]
}

export type Transport = {
  name: string
  capabilities?: TransportCapabilities
  /** Request/response turn. A synchronous backend is a stream of one batch. */
  run(request: TurnRequest, signal: AbortSignal): AsyncIterable<Stimulus>
  /**
   * Optional push channel for stimuli the backend sends outside a turn
   * (WebSocket, long jobs, proactive messages). Returns a disconnect function.
   */
  connect?(deliver: (stimuli: Iterable<Stimulus> | AsyncIterable<Stimulus>) => void): () => void
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

export type Match = {
  action: string
  args?: unknown
  /** 0..1. Matches below the router threshold are ignored. */
  confidence?: number
  /** Short confirmation shown/spoken after the action. */
  reply?: (result: unknown) => string | undefined
}

export type Matcher = {
  name: string
  /** Lower runs first. */
  priority?: number
  match(signal: Signal): Match | null | undefined | Promise<Match | null | undefined>
}

export type CaptureHandler = (signal: Signal) => void | Promise<void>

export type CaptureOptions = {
  /** Only capture signals this returns true for; others follow the normal route. */
  accepts?: (signal: Signal) => boolean | Promise<boolean>
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

export type SessionSnapshot = {
  threadId: string
  messages: Message[]
  state?: unknown
  /** Owned by the `memory` plugin (summary of turns that left the window). Stored with the conversation. */
  memory?: unknown
  /** Conversation attributes (ADR 0017): codes such as an experiment's variant. */
  attributes?: ConversationAttributes
}

export type Storage = {
  load(): SessionSnapshot | null | Promise<SessionSnapshot | null>
  save(snapshot: SessionSnapshot): void | Promise<void>
  clear(): void | Promise<void>
}

/**
 * How long a stored conversation lives.
 * - `'key'`: until its encryption key expires (`storage-local`).
 * - `'server'`: whatever the backend decides (`storage-backend`).
 * - `{ ttlMinutes }`: deleted after this much inactivity.
 * - `'tab'`: tied to the tab; gone (or unreachable) when it closes.
 */
export type Retention = 'key' | 'server' | 'tab' | { ttlMinutes: number }

/** The `retention` service, provided by storage plugins. */
export type RetentionControl = {
  readonly current: Retention
  /** The developer's default followed by what end users may pick. Only one = nothing to choose. */
  readonly choices: readonly Retention[]
  /** Where the conversation is kept. */
  readonly location: 'browser' | 'server'
  /** Whether it is encrypted in the browser. */
  readonly encrypted: boolean
  /** Lifetime of the encryption key after the last activity, when known. 0 = until the browser closes. */
  readonly keyTtlMinutes?: number
  /** Applies one of `choices`, moves what is stored and remembers it in this browser. */
  set(retention: Retention): Promise<void>
  subscribe(listener: () => void): () => void
}
