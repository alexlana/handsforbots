import { resolveOptionalDependency } from '../utils/probeOptional.js'

const BACKEND_START = 'core.calling_backend'
const BACKEND_END = 'core.backend_responded'

/**
 * OpenTelemetry exporter (optional dependency).
 * Builds one trace tree per conversation turn with phase spans for bottleneck analysis.
 */
export function createOtelExporter(config = {}) {
	const id = 'otel'
	let tracer = null
	let otelContext = null
	let otelTrace = null
	let SpanStatusCode = null
	/** @type {Map<string, TurnTraceState>} */
	const turns = new Map()

	// Sync fast-path: when observability-stack.js provides the full OTel bootstrap,
	// initialize immediately so turn.start events fired during async init are not lost.
	if (typeof config.getTracer === 'function') {
		tracer = config.getTracer('semantic-event-observability', '0.0.0')
	}
	if (config.traceApi) {
		otelContext = config.traceApi.context
		otelTrace = config.traceApi.trace
		SpanStatusCode = config.traceApi.SpanStatusCode
	}

	return {
		id,
		available: false,
		description: 'OpenTelemetry spans and metrics for Grafana Tempo/Mimir',

		async init(context) {
			const resolved = await resolveOptionalDependency(config.api, {
				globalName: 'otel',
				moduleSpecifier: '@opentelemetry/api',
			})

			// Re-get tracer with the proper service identity if possible
			if (typeof config.getTracer === 'function') {
				tracer = config.getTracer(context.identity.otelServiceName, context.identity.version)
			} else if (resolved) {
				const traceApi = resolved.module.trace || resolved.module
				if (typeof traceApi?.getTracer === 'function') {
					tracer = traceApi.getTracer(context.identity.otelServiceName, context.identity.version)
				}
			}

			if (!tracer) return

			if (config.traceApi) {
				otelContext = config.traceApi.context
				otelTrace = config.traceApi.trace
				SpanStatusCode = config.traceApi.SpanStatusCode
			} else if (resolved?.module) {
				otelContext = resolved.module.context
				otelTrace = resolved.module.trace
				SpanStatusCode = resolved.module.SpanStatusCode
			}

			this.available = Boolean(otelContext && otelTrace)
		},

		onEvent(event) {
			if (!tracer || !otelContext || !otelTrace) return

			if (event.type === 'turn.start') {
				startTurnTrace(event)
				return
			}

			if (event.type === 'turn.end') {
				endTurnTrace(event)
				return
			}

			if (event.type === 'bus.trigger' && event.turnId) {
				handleBusEvent(event)
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
			for (const state of turns.values()) {
				try { state.backendSpan?.end() } catch { /* noop */ }
				try { state.rootSpan?.end() } catch { /* noop */ }
			}
			turns.clear()
		},
	}

	function startTurnTrace(event) {
		const rootSpan = tracer.startSpan(`turn:${event.name || 'conversation'}`, {
			attributes: baseAttributes(event),
		})
		turns.set(event.turnId, {
			rootSpan,
			backendSpan: null,
			backendStartedAt: null,
			backendEndedAt: null,
		})
	}

	function endTurnTrace(event) {
		const state = turns.get(event.turnId)
		if (!state) return

		if (state.backendSpan) {
			state.backendSpan.end()
			state.backendSpan = null
		}

		if (event.durationMs != null) {
			state.rootSpan.setAttribute('turn.duration_ms', event.durationMs)
		}

		if (state.backendEndedAt != null) {
			const renderMs = Math.max(0, Date.now() - state.backendEndedAt)
			state.rootSpan.setAttribute('phase.render_ms', renderMs)
		}

		state.rootSpan.end()
		turns.delete(event.turnId)
	}

	function handleBusEvent(event) {
		const state = turns.get(event.turnId)
		if (!state) {
			recordEventSpan(event, null)
			return
		}

		const parentCtx = parentContext(state.rootSpan)

		if (event.name === BACKEND_START) {
			state.backendStartedAt = Date.now()
			state.backendSpan = tracer.startSpan('phase:backend', {
				attributes: {
					...baseAttributes(event),
					'phase.name': 'backend',
				},
			}, parentCtx)
			recordEventSpan(event, parentCtx)
			return
		}

		if (event.name === BACKEND_END) {
			if (state.backendSpan && state.backendStartedAt != null) {
				const backendMs = Math.max(0, Date.now() - state.backendStartedAt)
				state.rootSpan.setAttribute('phase.backend_ms', backendMs)
				state.backendSpan.end()
				state.backendSpan = null
				state.backendStartedAt = null
				state.backendEndedAt = Date.now()
			}
			recordEventSpan(event, parentCtx)
			return
		}

		recordEventSpan(event, parentCtx)
		maybeMarkError(event, state.rootSpan)
	}

	function recordEventSpan(event, parentCtx) {
		const span = tracer.startSpan(`event:${event.name}`, {
			attributes: {
				...baseAttributes(event),
				'event.payload_preview': event.payloadSummary?.preview,
			},
		}, parentCtx || undefined)
		span.end()

		if (event.turnId) {
			const state = turns.get(event.turnId)
			if (state) maybeMarkError(event, state.rootSpan)
		}
	}

	function parentContext(parentSpan) {
		return otelTrace.setSpan(otelContext.active(), parentSpan)
	}

	function maybeMarkError(event, rootSpan) {
		if (!SpanStatusCode || !rootSpan || !looksLikeError(event)) return
		rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: event.name })
		rootSpan.setAttribute('turn.error_event', event.name)
	}
}

function looksLikeError(event) {
	const preview = event.payloadSummary?.preview || ''
	if (/error|fail|exception/i.test(preview)) return true
	if (/error|fail|exception/i.test(event.name || '')) return true
	return false
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

/**
 * @typedef {object} TurnTraceState
 * @property {import('@opentelemetry/api').Span} rootSpan
 * @property {import('@opentelemetry/api').Span | null} backendSpan
 * @property {number | null} backendStartedAt
 * @property {number | null} backendEndedAt
 */
