import { resolveOptionalDependency } from '../utils/probeOptional.js'
import { isErrorEvent } from '../core/isErrorEvent.js'
import { SEO_METRICS } from '../core/MetricsRegistry.js'

/**
 * OpenTelemetry exporter (optional dependency).
 * Builds one trace tree per conversation turn with phase spans for bottleneck analysis.
 */
export function createOtelExporter(config = {}) {
	const id = 'otel'
	let tracer = null
	let meter = null
	let otelContext = null
	let otelTrace = null
	let SpanStatusCode = null
	let phases = []
	/** @type {Map<string, TurnTraceState>} */
	const turns = new Map()
	/** @type {Map<string, import('@opentelemetry/api').Counter>} */
	const counters = new Map()
	/** @type {Map<string, import('@opentelemetry/api').Histogram>} */
	const histograms = new Map()
	/** @type {Map<string, import('@opentelemetry/api').Gauge>} */
	const gauges = new Map()

	if (typeof config.getTracer === 'function') {
		tracer = config.getTracer('semantic-event-observability', '0.0.0')
	}
	if (typeof config.getMeter === 'function') {
		meter = config.getMeter('semantic-event-observability', '0.0.0')
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
			phases = context.phases || []

			const resolved = await resolveOptionalDependency(config.api, {
				globalName: 'otel',
				moduleSpecifier: '@opentelemetry/api',
			})

			if (typeof config.getTracer === 'function') {
				tracer = config.getTracer(context.identity.otelServiceName, context.identity.version)
			} else if (resolved) {
				const traceApi = resolved.module.trace || resolved.module
				if (typeof traceApi?.getTracer === 'function') {
					tracer = traceApi.getTracer(context.identity.otelServiceName, context.identity.version)
				}
			}

			if (typeof config.getMeter === 'function') {
				meter = config.getMeter(context.identity.otelServiceName, context.identity.version)
			} else if (resolved?.module?.metrics) {
				const metricsApi = resolved.module.metrics
				if (typeof metricsApi?.getMeter === 'function') {
					meter = metricsApi.getMeter(context.identity.otelServiceName, context.identity.version)
				}
			}

			if (config.traceApi) {
				otelContext = config.traceApi.context
				otelTrace = config.traceApi.trace
				SpanStatusCode = config.traceApi.SpanStatusCode
			} else if (resolved?.module) {
				otelContext = resolved.module.context
				otelTrace = resolved.module.trace
				SpanStatusCode = resolved.module.SpanStatusCode
			}

			if (meter) {
				initMetricInstruments(meter)
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
			recordOtelMetric(metric)
		},

		destroy() {
			for (const state of turns.values()) {
				for (const phaseSpan of state.phaseSpans.values()) {
					try { phaseSpan?.end() } catch { /* noop */ }
				}
				try { state.rootSpan?.end() } catch { /* noop */ }
			}
			turns.clear()
			counters.clear()
			histograms.clear()
			gauges.clear()
		},
	}

	function initMetricInstruments(activeMeter) {
		histograms.set(SEO_METRICS.TURN_DURATION, activeMeter.createHistogram(SEO_METRICS.TURN_DURATION, {
			description: 'Conversation turn duration',
			unit: 'ms',
		}))
		histograms.set(SEO_METRICS.PHASE_DURATION, activeMeter.createHistogram(SEO_METRICS.PHASE_DURATION, {
			description: 'Phase duration within a turn',
			unit: 'ms',
		}))
		counters.set(SEO_METRICS.TURNS_TOTAL, activeMeter.createCounter(SEO_METRICS.TURNS_TOTAL, {
			description: 'Turn outcomes',
		}))
		counters.set(SEO_METRICS.EVENTS_DROPPED, activeMeter.createCounter(SEO_METRICS.EVENTS_DROPPED, {
			description: 'Telemetry events dropped by policy',
		}))
		counters.set(SEO_METRICS.EVENTS_EMITTED, activeMeter.createCounter(SEO_METRICS.EVENTS_EMITTED, {
			description: 'Semantic events emitted',
		}))
		counters.set(SEO_METRICS.EXPORTER_ERRORS, activeMeter.createCounter(SEO_METRICS.EXPORTER_ERRORS, {
			description: 'Exporter handler errors',
		}))

		if (typeof activeMeter.createGauge === 'function') {
			gauges.set(SEO_METRICS.STATE_GAUGE, activeMeter.createGauge(SEO_METRICS.STATE_GAUGE, {
				description: 'Host state gauge from stateProvider',
			}))
		}
	}

	function recordOtelMetric(metric) {
		if (!metric) return

		const attributes = toOtelAttributes(metric.labels)

		if (metric.type === 'histogram') {
			histograms.get(metric.name)?.record(metric.value, attributes)
			return
		}

		if (metric.type === 'gauge' && metric.name === SEO_METRICS.STATE_GAUGE) {
			gauges.get(SEO_METRICS.STATE_GAUGE)?.record(metric.value, attributes)
			return
		}

		if (metric.type === 'counter') {
			counters.get(metric.name)?.add(metric.value ?? 1, attributes)
		}
	}

	function startTurnTrace(event) {
		const rootSpan = tracer.startSpan(`turn:${event.name || 'conversation'}`, {
			attributes: baseAttributes(event),
		})
		turns.set(event.turnId, {
			rootSpan,
			phaseSpans: new Map(),
			phaseStartedAt: new Map(),
			lastPhaseEndedAt: null,
		})
	}

	function endTurnTrace(event) {
		const state = turns.get(event.turnId)
		if (!state) return

		for (const phaseSpan of state.phaseSpans.values()) {
			try { phaseSpan.end() } catch { /* noop */ }
		}
		state.phaseSpans.clear()

		if (event.durationMs != null) {
			state.rootSpan.setAttribute('turn.duration_ms', event.durationMs)
		}

		if (state.lastPhaseEndedAt != null) {
			const renderMs = Math.max(0, Date.now() - state.lastPhaseEndedAt)
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

		for (const phase of phases) {
			if (event.name === phase.startEvent) {
				state.phaseStartedAt.set(phase.id, Date.now())
				const phaseSpan = tracer.startSpan(`phase:${phase.id}`, {
					attributes: {
						...baseAttributes(event),
						'phase.name': phase.id,
					},
				}, parentCtx)
				state.phaseSpans.set(phase.id, phaseSpan)
				recordEventSpan(event, parentCtx)
				return
			}

			if (event.name === phase.endEvent) {
				const phaseSpan = state.phaseSpans.get(phase.id)
				const startedAt = state.phaseStartedAt.get(phase.id)
				if (phaseSpan && startedAt != null) {
					const phaseMs = Math.max(0, Date.now() - startedAt)
					state.rootSpan.setAttribute(`phase.${phase.id}_ms`, phaseMs)
					phaseSpan.end()
					state.phaseSpans.delete(phase.id)
					state.phaseStartedAt.delete(phase.id)
					state.lastPhaseEndedAt = Date.now()
				}
				recordEventSpan(event, parentCtx)
				return
			}
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
		if (!SpanStatusCode || !rootSpan || !isErrorEvent(event)) return
		rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: event.name })
		rootSpan.setAttribute('turn.error_event', event.name)
		rootSpan.setAttribute('error.type', event.name)
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

function toOtelAttributes(labels = {}) {
	const output = {}
	for (const [key, value] of Object.entries(labels)) {
		if (value == null) continue
		output[`seo.${key}`] = String(value)
	}
	return output
}

/**
 * @typedef {object} TurnTraceState
 * @property {import('@opentelemetry/api').Span} rootSpan
 * @property {Map<string, import('@opentelemetry/api').Span>} phaseSpans
 * @property {Map<string, number>} phaseStartedAt
 * @property {number | null} lastPhaseEndedAt
 */
