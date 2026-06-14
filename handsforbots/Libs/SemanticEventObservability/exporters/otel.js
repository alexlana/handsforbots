import { resolveOptionalDependency } from '../utils/probeOptional.js'

/**
 * OpenTelemetry exporter (optional dependency).
 * Uses injected API/tracer or tries @opentelemetry/api dynamically.
 */
export function createOtelExporter(config = {}) {
	const id = 'otel'
	let tracer = null
	let activeSpans = new Map()

	return {
		id,
		available: false,
		description: 'OpenTelemetry spans and metrics for Grafana Tempo/Mimir',

		async init(context) {
			const resolved = await resolveOptionalDependency(config.api, {
				globalName: 'otel',
				moduleSpecifier: '@opentelemetry/api',
			})

			if (!resolved) return

			if (typeof config.getTracer === 'function') {
				tracer = config.getTracer(context.identity.otelServiceName, context.identity.version)
				this.available = Boolean(tracer)
				return
			}

			const traceApi = resolved.module.trace || resolved.module
			if (typeof traceApi?.getTracer !== 'function') return

			// TraceAPI.getTracer must keep `this` — do not destructure the method.
			tracer = traceApi.getTracer(context.identity.otelServiceName, context.identity.version)
			this.available = true
		},

		onEvent(event) {
			if (!tracer) return

			if (event.type === 'turn.start') {
				const span = tracer.startSpan(`turn:${event.name || 'conversation'}`, {
					attributes: baseAttributes(event),
				})
				activeSpans.set(event.turnId, span)
				return
			}

			if (event.type === 'turn.end') {
				const span = activeSpans.get(event.turnId)
				if (span) {
					if (event.durationMs != null) {
						span.setAttribute('turn.duration_ms', event.durationMs)
					}
					span.end()
					activeSpans.delete(event.turnId)
				}
				return
			}

			if (event.type === 'bus.trigger') {
				const parent = event.turnId ? activeSpans.get(event.turnId) : null
				const span = tracer.startSpan(`event:${event.name}`, {
					attributes: {
						...baseAttributes(event),
						'event.payload_preview': event.payloadSummary?.preview,
					},
				}, parent ? undefined : undefined)

				span.end()
			}
		},

		onMetric(metric) {
			if (!tracer || !metric) return
			const span = tracer.startSpan(`metric:${metric.name}`, {
				attributes: {
					'metric.value': metric.value,
					...flattenLabels(metric.labels),
				},
			})
			span.end()
		},

		destroy() {
			for (const span of activeSpans.values()) {
				try { span.end() } catch { /* noop */ }
			}
			activeSpans = new Map()
		},
	}
}

function baseAttributes(event) {
	return {
		'seo.session_id': event.sessionId,
		'seo.turn_id': event.turnId,
		'seo.trace_id': event.traceId,
		'seo.event_name': event.name,
		'seo.environment': event.environment,
	}
}

function flattenLabels(labels = {}) {
	const output = {}
	for (const [key, value] of Object.entries(labels)) {
		output[`metric.label.${key}`] = String(value)
	}
	return output
}
