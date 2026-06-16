import { resolveOptionalDependency } from '../utils/probeOptional.js'

/**
 * Grafana Faro exporter (optional dependency).
 * Sends semantic events as Faro custom events/logs.
 */
export function createFaroExporter(config = {}) {
	const id = 'faro'
	let faro = null

	return {
		id,
		available: false,
		description: 'Grafana Faro custom events for Loki/Grafana dashboards',

		async init() {
			if (config.client?.api) {
				faro = config.client
				this.available = true
				return
			}

			const resolved = await resolveOptionalDependency(config.client, {
				globalName: 'faro',
				moduleSpecifier: '@grafana/faro-web-sdk',
			})

			faro = resolved?.module?.faro || resolved?.module?.default || resolved?.module
			if (!faro?.api?.pushEvent && !faro?.api?.pushLog) return
			this.available = true
		},

		onEvent(event) {
			if (!faro?.api) return

			const payload = compactEvent(event)

			if (typeof faro.api.pushEvent === 'function') {
				faro.api.pushEvent('semantic_event', payload)
				return
			}

			if (typeof faro.api.pushLog === 'function') {
				faro.api.pushLog([JSON.stringify(payload)])
			}
		},

		onMetric(metric) {
			if (!faro?.api?.pushMeasurement) return
			faro.api.pushMeasurement({
				type: 'sevo_metric',
				values: { [metric.name]: metric.value },
				labels: metric.labels || {},
			})
		},
	}
}

function compactEvent(event) {
	return {
		type: event.type,
		name: event.name,
		sessionId: event.sessionId,
		turnId: event.turnId,
		traceId: event.traceId,
		durationMs: event.durationMs,
		payloadPreview: event.payloadSummary?.preview,
		queueDepth: event.state?.queueDepth,
		callingBackend: event.state?.callingBackend,
	}
}
