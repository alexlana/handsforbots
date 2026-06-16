/**
 * Reduce bus event name cardinality for metric labels.
 */
export function bucketEventName(name) {
	const normalized = String(name || 'unknown')
		.replace(/\d{5,}/g, '*')
		.replace(/[a-f0-9]{16,}/gi, '*')

	if (normalized.length <= 64) return normalized
	return `${normalized.slice(0, 61)}...`
}
