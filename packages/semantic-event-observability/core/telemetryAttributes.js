/**
 * Shared telemetry attribute prefix for spans and metric labels.
 */
export const SEVO_ATTR_PREFIX = 'sevo.'

export function sevoAttributes(event) {
	return {
		[`${SEVO_ATTR_PREFIX}session_id`]: event.sessionId,
		[`${SEVO_ATTR_PREFIX}turn_id`]: event.turnId,
		[`${SEVO_ATTR_PREFIX}trace_id`]: event.traceId,
		[`${SEVO_ATTR_PREFIX}event_name`]: event.name,
		[`${SEVO_ATTR_PREFIX}environment`]: event.environment,
	}
}

/** Canonical Prometheus label keys (no sevo. prefix — see metrics-roadmap.md). */
export const SEVO_METRIC_LABEL_KEYS = new Set([
	'environment',
	'phase',
	'status',
	'reason',
	'event_type',
	'key',
	'event',
	'metric',
	'exporter',
	'vital',
	'rating',
	'navigationType',
	'source',
	'start_event',
	'input_plugin',
])

export function sevoMetricLabelAttributes(labels = {}) {
	const output = {}
	for (const [key, value] of Object.entries(labels)) {
		if (value == null) continue
		const labelKey = SEVO_METRIC_LABEL_KEYS.has(key) ? key : `${SEVO_ATTR_PREFIX}${key}`
		output[labelKey] = String(value)
	}
	return output
}
