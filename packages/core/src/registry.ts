import type {
  Confirmer,
  Message,
  Origin,
  RetentionControl,
  Route,
  Signal,
  Stimulus,
  Storage,
  Transport,
  TurnRequest,
} from './types.js'

/**
 * Services plugins can provide. Packages extend it with declaration merging:
 *
 *   declare module '@handsforbots/core' {
 *     interface Services { stt: SpeechToText }
 *   }
 */
export interface Services {
  transport: Transport
  storage: Storage
  retention: RetentionControl
  confirm: Confirmer
}

export type TurnPhase = 'received' | 'acting' | 'done' | 'error' | 'aborted'

export type TurnStatus = {
  turnId: string
  phase: TurnPhase
  route?: Route
  /** The trigger that started the turn (absent for push turns). */
  signal?: Signal
  error?: string
  at: number
}

export type TurnResult = {
  status: TurnStatus
  /** Messages added by this turn, starting with the user message. */
  messages: Message[]
}

export type ActionInvocation = { name: string; args: unknown; origin: Origin; callId: string }

/**
 * Interception points. Interceptors run in priority order and are awaited, so
 * they may be sync or async. Return a new value to replace it, nothing to keep
 * it, or `null` to drop it (signals, stimuli) / cancel it (requests, actions).
 * Packages extend it with declaration merging.
 */
export interface Hooks {
  /** Before a signal is stored (context) or starts a turn (trigger). */
  'signal.before': Signal
  /** Before a turn request goes to the transport (e.g. redact PII). */
  'request.before': TurnRequest
  /** Before any action runs, whoever called it. */
  'action.before': ActionInvocation
  /** Before a stimulus reaches history and sinks. */
  'stimulus.before': Stimulus
}

export type Interceptor<T> = (value: T) => T | null | undefined | void | Promise<T | null | undefined | void>

/** Kernel events. Packages extend it with declaration merging, like `Services`. */
export interface Events {
  signal: Signal
  'context.changed': Signal[]
  'turn.status': TurnStatus
  stimulus: { turnId: string; stimulus: Stimulus }
  'messages.changed': Message[]
  'state.changed': unknown
  'action.invoked': { name: string; origin: string; callId: string; result?: unknown; error?: string }
  'service.provided': { key: keyof Services; by: string }
  'service.removed': { key: keyof Services; by: string }
  'plugin.mounted': { name: string }
  'plugin.disposed': { name: string }
  error: { error: unknown; source: string }
}
