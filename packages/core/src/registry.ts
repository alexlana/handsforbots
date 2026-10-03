import type {
  Confirmer,
  Message,
  Route,
  Signal,
  Stimulus,
  Storage,
  Transport,
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
  confirm: Confirmer
}

export type TurnPhase = 'received' | 'acting' | 'done' | 'error' | 'aborted'

export type TurnStatus = {
  turnId: string
  phase: TurnPhase
  route?: Route
  /** The trigger that started the turn. */
  signal: Signal
  error?: string
  at: number
}

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
