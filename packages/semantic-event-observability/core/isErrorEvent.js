/**
 * Default heuristic for error-like semantic events.
 */
export function isErrorEvent(event) {
	const preview = event.payloadSummary?.preview || ''
	if (/error|fail|exception/i.test(preview)) return true
	if (/error|fail|exception/i.test(event.name || '')) return true
	return false
}
