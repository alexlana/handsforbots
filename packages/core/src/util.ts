import type { MediaPart, Message, Part, Retention, SessionSnapshot } from './types.js'

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

/** A snapshot ready to be stored as JSON: Blobs replaced by `omitted_media` placeholders. How much is kept is the `memory` plugin's job. */
export function storableSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  return { ...snapshot, messages: snapshot.messages.map(withoutBlobs) }
}

const isMedia = (p: Part): p is MediaPart => p.type === 'image' || p.type === 'audio' || p.type === 'video' || p.type === 'file'

function withoutBlobs(message: Message): Message {
  if (message.role === 'tool') return message
  if (!message.parts.some((p) => isMedia(p) && p.source.kind === 'blob')) return message
  const parts: Part[] = message.parts.map((p) =>
    isMedia(p) && p.source.kind === 'blob'
      ? { type: 'data', name: 'omitted_media', value: { type: p.type, mimeType: p.mimeType, name: p.name } }
      : p,
  )
  return { ...message, parts } as Message
}
