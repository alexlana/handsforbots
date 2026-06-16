export const SEO_METRICS = {
	TURN_DURATION: 'seo_turn_duration_ms',
	PHASE_DURATION: 'seo_phase_duration_ms',
	TURNS_TOTAL: 'seo_turns_total',
	EVENTS_DROPPED: 'seo_events_dropped_total',
	STATE_GAUGE: 'seo_state_gauge',
	EVENTS_EMITTED: 'seo_events_emitted_total',
	EXPORTER_ERRORS: 'seo_exporter_errors_total',
}

/**
 * Canonical seo_* metric recording for Semantic Event Observability.
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
		subscribe(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},

		recordTurnDuration(durationMs, labels = {}) {
			if (durationMs == null || Number.isNaN(durationMs)) return
			return emit({
				name: SEO_METRICS.TURN_DURATION,
				type: 'histogram',
				value: Math.max(0, durationMs),
				labels,
			})
		},

		recordPhaseDuration(phase, durationMs, labels = {}) {
			if (durationMs == null || Number.isNaN(durationMs)) return
			return emit({
				name: SEO_METRICS.PHASE_DURATION,
				type: 'histogram',
				value: Math.max(0, durationMs),
				labels: { phase, ...labels },
			})
		},

		recordTurnStatus(status, labels = {}) {
			return emit({
				name: SEO_METRICS.TURNS_TOTAL,
				type: 'counter',
				value: 1,
				labels: { status, ...labels },
			})
		},

		recordEventDropped(reason) {
			return emit({
				name: SEO_METRICS.EVENTS_DROPPED,
				type: 'counter',
				value: 1,
				labels: { reason: reason || 'unknown' },
			})
		},

		recordStateGauge(key, value, labels = {}) {
			if (typeof value !== 'number' || Number.isNaN(value)) return
			return emit({
				name: SEO_METRICS.STATE_GAUGE,
				type: 'gauge',
				value,
				labels: { key, ...labels },
			})
		},

		recordEventEmitted(eventType, labels = {}) {
			return emit({
				name: SEO_METRICS.EVENTS_EMITTED,
				type: 'counter',
				value: 1,
				labels: { event_type: eventType || 'unknown', ...labels },
			})
		},

		recordExporterError(exporterId) {
			return emit({
				name: SEO_METRICS.EXPORTER_ERRORS,
				type: 'counter',
				value: 1,
				labels: { exporter: exporterId || 'unknown' },
			})
		},
	}
}
