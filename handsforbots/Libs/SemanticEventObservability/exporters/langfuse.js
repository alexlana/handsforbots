import { resolveOptionalDependency } from '../utils/probeOptional.js'

/**
 * Langfuse exporter (optional dependency).
 * Uses @langfuse/tracing startObservation when available,
 * or injected client from config.
 */
export function createLangfuseExporter(config = {}) {
	const id = 'langfuse'
	let startObservation = null
	let activeObservations = new Map()
	let exporterConfig = {}

	return {
		id,
		available: false,
		description: 'Langfuse traces/events for LLM-centric observability',

		async init(context) {
			exporterConfig = config
			const resolved = await resolveOptionalDependency(config.tracing, {
				moduleSpecifier: '@langfuse/tracing',
			})

			startObservation = resolved?.module?.startObservation || config.startObservation
			if (typeof startObservation !== 'function') return

			this.available = true
		},

		onEvent(event) {
			if (!startObservation) return

			if (event.type === 'turn.start') {
				const observation = startObservation(`turn:${event.name || 'conversation'}`, {
					input: { event: event.name },
					metadata: baseMetadata(event, exporterConfig),
				}, { asType: 'span' })
				activeObservations.set(event.turnId, observation)
				return
			}

			if (event.type === 'turn.end') {
				const observation = activeObservations.get(event.turnId)
				if (observation?.end) {
					observation.update?.({
						output: { durationMs: event.durationMs },
					})
					observation.end()
				}
				activeObservations.delete(event.turnId)
				return
			}

			startObservation(`event:${event.name}`, {
				input: { preview: event.payloadSummary?.preview },
				metadata: baseMetadata(event, exporterConfig),
			}, { asType: 'event' })
		},

		onMetric(metric) {
			if (!startObservation) return
			startObservation(`metric:${metric.name}`, {
				input: { value: metric.value, labels: metric.labels || {} },
				metadata: { source: 'semantic-event-observability' },
			}, { asType: 'event' })
		},

		destroy() {
			for (const observation of activeObservations.values()) {
				try { observation.end?.() } catch { /* noop */ }
			}
			activeObservations = new Map()
		},
	}
}

function baseMetadata(event, config = {}) {
	return {
		sessionId: event.sessionId,
		turnId: event.turnId,
		traceId: event.traceId,
		eventName: event.name,
		environment: event.environment,
		project: config.project,
	}
}
