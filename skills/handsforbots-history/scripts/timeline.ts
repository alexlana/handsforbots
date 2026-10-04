import { textOf, type AssistantMessage, type H4B, type Message, type Route, type ToolMessage } from '@handsforbots/core'

/**
 * Decision timeline on top of the H4B history (`h4b.messages`).
 *
 * Copy this file into the host project. It pairs each action call with its
 * result, so a user decision recorded with `h4b.runAction()` reads as one entry.
 */

export type TimelineEntry =
  | { kind: 'user'; id: string; at: number; route?: Route; source: string; modality: string; text: string; message: Message }
  | { kind: 'assistant'; id: string; at: number; route?: Route; text: string; message: Message }
  | {
      kind: 'action'
      id: string
      at: number
      route?: Route
      name: string
      args: unknown
      result?: unknown
      error?: string
      /** False while the action has not returned yet. */
      settled: boolean
    }

export type TimelineOptions = {
  /** Keep only these entry kinds. */
  kinds?: TimelineEntry['kind'][]
  /** Keep only these routes, e.g. ['direct'] for decisions made in the GUI. */
  routes?: Route[]
  /** Keep only these action names. */
  actions?: string[]
}

export function timeline(messages: readonly Message[], options: TimelineOptions = {}): TimelineEntry[] {
  const results = new Map<string, ToolMessage>()
  for (const message of messages) if (message.role === 'tool') results.set(message.toolCallId, message)

  const entries: TimelineEntry[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      entries.push({
        kind: 'user',
        id: message.id,
        at: message.createdAt,
        route: message.route,
        source: message.source,
        modality: message.modality,
        text: textOf(message),
        message,
      })
    } else if (message.role === 'assistant') {
      const text = textOf(message)
      if (text) entries.push({ kind: 'assistant', id: message.id, at: message.createdAt, route: message.route, text, message })
      for (const call of (message as AssistantMessage).toolCalls ?? []) {
        const result = results.get(call.id)
        results.delete(call.id)
        entries.push({
          kind: 'action',
          id: call.id,
          at: result?.createdAt ?? message.createdAt,
          route: message.route,
          name: call.name,
          args: call.args,
          result: result?.result,
          error: result?.error,
          settled: !!result,
        })
      }
    }
  }
  // Results without a call in this history (e.g. a backend-executed tool, or the call was trimmed by storage).
  for (const result of results.values()) {
    entries.push({
      kind: 'action',
      id: result.toolCallId,
      at: result.createdAt,
      route: result.route,
      name: result.name,
      args: undefined,
      result: result.result,
      error: result.error,
      settled: true,
    })
  }
  entries.sort((a, b) => a.at - b.at)

  return entries.filter(
    (entry) =>
      (!options.kinds || options.kinds.includes(entry.kind)) &&
      (!options.routes || (entry.route !== undefined && options.routes.includes(entry.route))) &&
      (!options.actions || (entry.kind === 'action' && options.actions.includes(entry.name))),
  )
}

/** Calls `listener` with a fresh timeline now and whenever the history changes. Returns an unsubscribe function. */
export function watchTimeline(h4b: H4B, listener: (entries: TimelineEntry[]) => void, options: TimelineOptions = {}): () => void {
  listener(timeline(h4b.messages, options))
  return h4b.on('messages.changed', (messages) => listener(timeline(messages, options)))
}
