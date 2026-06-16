export const SEVO_METRICS = {
	TURN_DURATION: 'sevo_turn_duration_ms',
	PHASE_DURATION: 'sevo_phase_duration_ms',
	TURNS_TOTAL: 'sevo_turns_total',
	EVENTS_DROPPED: 'sevo_events_dropped_total',
	STATE_GAUGE: 'sevo_state_gauge',
	EVENTS_EMITTED: 'sevo_events_emitted_total',
	EXPORTER_ERRORS: 'sevo_exporter_errors_total',
	ACTIVE_TURNS: 'sevo_active_turns',
	SESSION_TURNS_TOTAL: 'sevo_session_turns_total',
	WEB_VITAL: 'sevo_web_vital',
}

/** @deprecated Use SEVO_METRICS */
export const SEO_METRICS = SEVO_METRICS

/**
 * Canonical sevo_* metric recording for Semantic Event Observability.
 */
export function createMetricsRegistry(options = {}) {
	const environment = options.environment || 'development'
	const listeners = new Set()

	function emit(metric) {
		const record = {
			name: metric.name,
			type: metric.type,
			value: metric.value,
			labels: {
				environment,
				...(metric.labels || {}),
			},
			timestamp: new Date().toISOString(),
		}

		for (const listener of listeners) {
			try { listener(record) } catch { /* noop */ }
		}

		return record
	}

	return {
		SEVO_METRICS,

		subscribe(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},

		recordTurnDuration(durationMs, labels = {}) {
			if (durationMs == null || Number.isNaN(durationMs)) return
			return emit({
				name: SEVO_METRICS.TURN_DURATION,
				type: 'histogram',
				value: Math.max(0, durationMs),
				labels,
			})
		},

		recordPhaseDuration(phase, durationMs, labels = {}) {
			if (durationMs == null || Number.isNaN(durationMs)) return
			return emit({
				name: SEVO_METRICS.PHASE_DURATION,
				type: 'histogram',
				value: Math.max(0, durationMs),
				labels: { phase, ...labels },
			})
		},

		recordTurnStatus(status, labels = {}) {
			return emit({
				name: SEVO_METRICS.TURNS_TOTAL,
				type: 'counter',
				value: 1,
				labels: { status, ...labels },
			})
		},

		recordEventDropped(reason) {
			return emit({
				name: SEVO_METRICS.EVENTS_DROPPED,
				type: 'counter',
				value: 1,
				labels: { reason: reason || 'unknown' },
			})
		},

		recordStateGauge(key, value, labels = {}) {
			if (typeof value !== 'number' || Number.isNaN(value)) return
			return emit({
				name: SEVO_METRICS.STATE_GAUGE,
				type: 'gauge',
				value,
				labels: { key, ...labels },
			})
		},

		recordEventEmitted(eventType, labels = {}) {
			return emit({
				name: SEVO_METRICS.EVENTS_EMITTED,
				type: 'counter',
				value: 1,
				labels: { event_type: eventType || 'unknown', ...labels },
			})
		},

		recordExporterError(exporterId) {
			return emit({
				name: SEVO_METRICS.EXPORTER_ERRORS,
				type: 'counter',
				value: 1,
				labels: { exporter: exporterId || 'unknown' },
			})
		},

		recordActiveTurns(count) {
			if (typeof count !== 'number' || Number.isNaN(count)) return
			return emit({
				name: SEVO_METRICS.ACTIVE_TURNS,
				type: 'gauge',
				value: Math.max(0, count),
				labels: {},
			})
		},

		recordSessionTurnsRollup(counts = {}, labels = {}) {
			const records = []
			if (counts.completed > 0) {
				records.push(emit({
					name: SEVO_METRICS.SESSION_TURNS_TOTAL,
					type: 'counter',
					value: counts.completed,
					labels: { status: 'completed', ...labels },
				}))
			}
			if (counts.abandoned > 0) {
				records.push(emit({
					name: SEVO_METRICS.SESSION_TURNS_TOTAL,
					type: 'counter',
					value: counts.abandoned,
					labels: { status: 'abandoned', ...labels },
				}))
			}
			return records
		},

		recordWebVital(name, value, labels = {}) {
			if (value == null || Number.isNaN(value)) return
			return emit({
				name: SEVO_METRICS.WEB_VITAL,
				type: 'histogram',
				value: Math.max(0, value),
				labels: { vital: name || 'unknown', ...labels },
			})
		},
	}
}
