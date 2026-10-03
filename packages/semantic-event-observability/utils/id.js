/**
 * Create a random id suitable for turn/trace correlation.
 */
export function createId(prefix = 'id') {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return `${prefix}_${crypto.randomUUID()}`
	}

	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
