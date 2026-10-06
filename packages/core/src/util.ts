import type { Message, Part, Retention, SessionSnapshot } from './types.js'

/** Concatenated text of a message or a list of parts. */
export function textOf(source: Message | Part[]): string {
  const parts = Array.isArray(source) ? source : 'parts' in source ? source.parts : []
  return parts
    .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

/** Whether two retentions are the same choice. */
export function sameRetention(a: Retention, b: Retention): boolean {
  return typeof a === 'object' && typeof b === 'object' ? a.ttlMinutes === b.ttlMinutes : a === b
}

/** A snapshot ready to be stored as JSON: the last `maxMessages` messages, Blobs replaced by `omitted_media` placeholders. */
export function storableSnapshot(snapshot: SessionSnapshot, maxMessages = 200): SessionSnapshot {
  return { ...snapshot, messages: snapshot.messages.slice(-maxMessages).map(withoutBlobs) }
}

function withoutBlobs(message: Message): Message {
  if (message.role === 'tool') return message
  if (!message.parts.some((p) => p.type !== 'text' && p.type !== 'data' && p.source.kind === 'blob')) return message
  const parts: Part[] = message.parts.map((p) =>
    p.type !== 'text' && p.type !== 'data' && p.source.kind === 'blob'
      ? { type: 'data', name: 'omitted_media', value: { type: p.type, mimeType: p.mimeType, name: p.name } }
      : p,
  )
  return { ...message, parts } as Message
}
