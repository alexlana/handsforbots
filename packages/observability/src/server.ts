import { parseBaggage } from '@handsforbots/semantic-event-observability/baggage'

/**
 * For the backend (Node, Deno, edge): reads the conversation attributes the
 * page sent as W3C `baggage` (ADR 0017), keeping only the keys you allow and
 * values shaped like codes, so a browser cannot put arbitrary text in your
 * traces. No dependency on the browser or on `@handsforbots/core`.
 */

export type AttributeType = 'string' | 'number' | 'boolean'

export type ReadAttributesOptions = {
  /**
   * Keys to keep. A list keeps them as strings; an object says the type of
   * each (`{ 'greeting.kind': 'string', 'greeting.index': 'number' }`), and a
   * value that does not convert is dropped.
   */
  allow: readonly string[] | Readonly<Record<string, AttributeType>>
  /** Longest string value kept. Default 64. */
  maxLength?: number
}

type HeaderSource =
  | string
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>
  | null
  | undefined

const CODE = /^[A-Za-z0-9_.:-]+$/

/**
 *   const attributes = readConversationAttributes(request.headers, {
 *     allow: { 'greeting.kind': 'string', 'greeting.index': 'number' },
 *   })
 *   span.setAttributes(attributes)
 */
export function readConversationAttributes(
  source: HeaderSource,
  options: ReadAttributesOptions,
): Record<string, string | number | boolean> {
  const types: Record<string, AttributeType> = Array.isArray(options.allow)
    ? Object.fromEntries((options.allow as readonly string[]).map((key) => [key, 'string' as const]))
    : { ...(options.allow as Record<string, AttributeType>) }
  const maxLength = options.maxLength ?? 64
  const baggage = parseBaggage(source)
  const result: Record<string, string | number | boolean> = {}
  for (const [key, type] of Object.entries(types)) {
    if (!Object.hasOwn(baggage, key)) continue
    const raw = baggage[key]!
    if (raw.length === 0 || raw.length > maxLength || !CODE.test(raw)) continue
    if (type === 'number') {
      const value = Number(raw)
      if (Number.isFinite(value)) result[key] = value
    } else if (type === 'boolean') {
      if (raw === 'true' || raw === 'false') result[key] = raw === 'true'
    } else {
      result[key] = raw
    }
  }
  return result
}
