/**
 * W3C Baggage (https://www.w3.org/TR/baggage/): `key=value` members separated
 * by commas, values percent-encoded. Used to send conversation attributes to
 * the backend next to `traceparent`.
 */

/** Limits from the spec: 64 members and 8192 bytes per header. */
export const BAGGAGE_MAX_MEMBERS = 64
export const BAGGAGE_MAX_BYTES = 8192

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

/** Encodes attributes as a baggage header value. Keys that are not tokens and `null` / `undefined` values are skipped. */
export function encodeBaggage(attributes = {}) {
	const members = []
	for (const [key, value] of Object.entries(attributes || {})) {
		if (value == null || !TOKEN.test(key)) continue
		members.push(`${key}=${encodeURIComponent(String(value))}`)
	}
	return members.join(',')
}

/**
 * Parses a baggage header into `{ key: value }` (strings, decoded). Properties
 * after `;` are ignored, as are malformed members. Accepts a string, a
 * `Headers`, or a plain headers object (any case of `baggage`).
 */
export function parseBaggage(source) {
	const header = baggageHeader(source)
	const result = {}
	if (!header) return result
	if (header.length > BAGGAGE_MAX_BYTES) return result
	let count = 0
	for (const raw of header.split(',')) {
		if (++count > BAGGAGE_MAX_MEMBERS) break
		const member = raw.split(';')[0].trim()
		const eq = member.indexOf('=')
		if (eq <= 0) continue
		const key = member.slice(0, eq).trim()
		if (!TOKEN.test(key)) continue
		try {
			result[key] = decodeURIComponent(member.slice(eq + 1).trim())
		} catch { /* malformed percent-encoding */ }
	}
	return result
}

/** Adds `attributes` to an existing baggage header value; ours win on the same key. */
export function mergeBaggage(existing, attributes = {}) {
	const ours = encodeBaggage(attributes)
	if (!existing) return ours
	const keys = new Set(ours ? ours.split(',').map((member) => member.split('=')[0]) : [])
	const kept = String(existing)
		.split(',')
		.map((member) => member.trim())
		.filter((member) => member && !keys.has(member.split(/[=;]/)[0].trim()))
	return [...kept, ...(ours ? [ours] : [])].join(',')
}

function baggageHeader(source) {
	if (!source) return ''
	if (typeof source === 'string') return source
	if (typeof source.get === 'function') return source.get('baggage') || ''
	for (const [key, value] of Object.entries(source)) {
		if (key.toLowerCase() === 'baggage') return Array.isArray(value) ? value.join(',') : String(value ?? '')
	}
	return ''
}
