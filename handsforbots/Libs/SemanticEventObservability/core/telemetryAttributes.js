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

export function sevoMetricLabelAttributes(labels = {}) {
	const output = {}
	for (const [key, value] of Object.entries(labels)) {
		if (value == null) continue
		output[`${SEVO_ATTR_PREFIX}${key}`] = String(value)
	}
	return output
}
