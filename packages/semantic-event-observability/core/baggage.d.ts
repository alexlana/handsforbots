export type BaggageValue = string | number | boolean

export const BAGGAGE_MAX_MEMBERS: 64
export const BAGGAGE_MAX_BYTES: 8192
/** Encodes attributes as a W3C baggage header value. */
export function encodeBaggage(attributes?: Readonly<Record<string, BaggageValue | null | undefined>>): string
/** Parses a W3C baggage header (string, Headers or headers object) into decoded strings. */
export function parseBaggage(
	source: string | { get(name: string): string | null } | Record<string, string | string[] | undefined> | null | undefined,
): Record<string, string>
/** Adds attributes to a baggage header value; the attributes win on the same key. */
export function mergeBaggage(existing: string | null | undefined, attributes?: Readonly<Record<string, BaggageValue>>): string
