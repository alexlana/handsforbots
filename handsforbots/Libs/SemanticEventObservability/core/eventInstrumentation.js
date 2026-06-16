/**
 * Decide whether a bus event should be recorded as telemetry.
 * Turn detection always runs regardless of this filter.
 */
export function createEventInstrumentation(options = {}) {
	const allowlist = options.eventAllowlist
		? new Set(options.eventAllowlist.map(String))
		: null
	const eventFilter = typeof options.eventFilter === 'function'
		? options.eventFilter
		: null

	return {
		shouldRecord(eventName) {
			const name = String(eventName)
			if (allowlist && !allowlist.has(name)) return false
			if (eventFilter && !eventFilter(name)) return false
			return true
		},
	}
}
