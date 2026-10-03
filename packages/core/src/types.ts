import type { StandardSchemaV1 } from './standard-schema.js'

/* -------------------------------------------------------------------------- */
/* Parts                                                                      */
/* -------------------------------------------------------------------------- */

/** Binary or remote media: either inline data (Blob / base64) or a URL. */
export type MediaSource =
  | { kind: 'blob'; blob: Blob }
  | { kind: 'base64'; data: string }
  | { kind: 'url'; url: string }

export type TextPart = { type: 'text'; text: string }
export type MediaPart = {
  type: 'image' | 'audio' | 'video' | 'file'
  mimeType: string
  source: MediaSource
  name?: string
}
/** Structured data: sensor readings, GUI events, quick replies, etc. */
export type DataPart = { type: 'data'; name: string; value: unknown }

export type Part = TextPart | MediaPart | DataPart

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
  meta?: Record<string, unknown>
  timestamp: number
}

export type SignalInput = Omit<Signal, 'id' | 'timestamp' | 'kind'> & {
  id?: string
  kind?: Signal['kind']
  timestamp?: number
}

/* -------------------------------------------------------------------------- */
/* Messages (history)                                                         */
/* -------------------------------------------------------------------------- */

/** How a turn was resolved: by a direct command (menu) or by a transport. */
export type Route = 'direct' | 'transport' | 'capture' | 'push'

export type ToolCall = { id: string; name: string; args: unknown }

export type UserMessage = {
  id: string
  role: 'user'
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
  parts: Part[]
  toolCalls?: ToolCall[]
  route?: Route
  /** True while text is still streaming. */
  streaming?: boolean
  createdAt: number
}

export type ToolMessage = {
  id: string
  role: 'tool'
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
  | { type: 'message.part'; messageId: string; part: Part }
  | { type: 'message.end'; messageId: string }
  /** The backend asks the client to run a registered action (frontend tool). */
  | { type: 'action.call'; callId: string; name: string; args: unknown; messageId?: string }
  /** A tool already executed by the backend; recorded for display and history. */
  | { type: 'action.result'; callId: string; name?: string; result: unknown }
  | { type: 'ui.render'; slot?: string; component: string; props?: unknown }
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
  /** Short sentence used when the action runs as a direct command. */
  describeResult?: (result: O, args: I) => string | undefined
}

export type ActionCallContext = {
  origin: Origin
  callId: string
  signal?: AbortSignal
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

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

export type SessionSnapshot = {
  threadId: string
  messages: Message[]
  state?: unknown
}

export type Storage = {
  load(): SessionSnapshot | null | Promise<SessionSnapshot | null>
  save(snapshot: SessionSnapshot): void | Promise<void>
  clear(): void | Promise<void>
}
