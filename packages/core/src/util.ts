import type { Message, Part } from './types.js'

/** Concatenated text of a message or a list of parts. */
export function textOf(source: Message | Part[]): string {
  const parts = Array.isArray(source) ? source : 'parts' in source ? source.parts : []
  return parts
    .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('')
}
