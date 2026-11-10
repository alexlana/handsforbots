/**
 * Conversation attributes (ADR 0017): short codes and numbers attached to a
 * conversation, such as the variant of an experiment it is in. They are saved
 * and restored with it and, with the `analytics` purpose, go on every span and
 * to the backend as W3C `baggage`. Never the visitor's text.
 */

export type AttributeValue = string | number | boolean

export type ConversationAttributes = Readonly<Record<string, AttributeValue>>

/** At most this many attributes per conversation. */
export const MAX_ATTRIBUTES = 16
/** Longest string value and key. */
export const MAX_ATTRIBUTE_LENGTH = 64

const KEY = /^[a-z][a-z0-9_.-]{0,63}$/
/** A code: letters, digits and `_ . : -`, no spaces, so a sentence never fits. */
const CODE = /^[A-Za-z0-9_.:-]{1,64}$/

export function isAttributeKey(key: unknown): key is string {
  return typeof key === 'string' && KEY.test(key)
}

export function isAttributeValue(value: unknown): value is AttributeValue {
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string' && CODE.test(value)
}

/**
 * Merges `changes` into `current`: `null` removes a key, invalid keys or values
 * are left out and listed in `rejected`, and keys beyond `MAX_ATTRIBUTES` too.
 */
export function mergeAttributes(
  current: ConversationAttributes,
  changes: Readonly<Record<string, AttributeValue | null | undefined>>,
): { attributes: ConversationAttributes; rejected: string[] } {
  const next: Record<string, AttributeValue> = { ...current }
  const rejected: string[] = []
  for (const [key, value] of Object.entries(changes ?? {})) {
    if (value === undefined) continue
    if (!isAttributeKey(key)) {
      rejected.push(key)
      continue
    }
    if (value === null) {
      delete next[key]
      continue
    }
    if (!isAttributeValue(value) || (!(key in next) && Object.keys(next).length >= MAX_ATTRIBUTES)) {
      rejected.push(key)
      continue
    }
    next[key] = value
  }
  return { attributes: Object.freeze(next), rejected }
}

/** Keeps only valid attributes (e.g. from storage, which the page does not control). */
export function cleanAttributes(input: unknown): ConversationAttributes {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return EMPTY_ATTRIBUTES
  return mergeAttributes(EMPTY_ATTRIBUTES, input as Record<string, AttributeValue>).attributes
}

export const EMPTY_ATTRIBUTES: ConversationAttributes = Object.freeze({})

/**
 * Someone saw a variant: kept in memory for the current conversation (never
 * stored), so `observability` can record exposures that happened before the
 * `analytics` purpose was granted.
 */
export type Exposure = {
  /** Which experiment, e.g. `greeting`. Same format as an attribute key. */
  experiment: string
  /** The variant, as attributes (usually the ones set on the conversation). */
  attributes: ConversationAttributes
  threadId: string
  at: number
}

/**
 * Draws one of `variants`, avoiding `previous` (the index drawn last) when
 * there is another option. Returns undefined for an empty list.
 */
export function pickVariant<T>(
  variants: readonly T[],
  previous?: number,
  random: () => number = Math.random,
): { variant: T; index: number } | undefined {
  if (variants.length === 0) return undefined
  const skip = variants.length > 1 && previous !== undefined && Number.isInteger(previous) && previous >= 0 && previous < variants.length
  let index = Math.floor(random() * (skip ? variants.length - 1 : variants.length))
  if (skip && index >= previous) index++
  index = Math.min(Math.max(index, 0), variants.length - 1)
  return { variant: variants[index]!, index }
}
