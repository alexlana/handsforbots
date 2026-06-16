import { resolveOptionalDependency } from '../utils/probeOptional.js'
import { createTraceMapper } from '../core/TraceMapper.js'
import { SEVO_METRICS } from '../core/MetricsRegistry.js'
import { sevoMetricLabelAttributes } from '../core/telemetryAttributes.js'
import { createOtelSpanBackend } from './otelTraceBackend.js'

/**
 * OpenTelemetry exporter (optional dependency).
 * Trace spans are driven by semantic events via TraceMapper.
 */
export function createOtelExporter(config = {}) {
	const id = 'otel'
	let tracer = null
	let meter = null
	let otelContext = null
	let otelTrace = null
	let otelPropagation = null
	let SpanStatusCode = null
	let SpanKind = null
	let traceMapper = null
	let isError = config.isError
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
		otelPropagation = config.traceApi.propagation
		SpanStatusCode = config.traceApi.SpanStatusCode
		SpanKind = config.traceApi.SpanKind
	}

	return {
		id,
		available: false,
		description: 'OpenTelemetry spans and metrics for Grafana Tempo/Mimir',

		async init(context) {
			if (typeof config.isError !== 'function' && typeof context.isError === 'function') {
				isError = context.isError
			}

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
				otelPropagation = config.traceApi.propagation
				SpanStatusCode = config.traceApi.SpanStatusCode
				SpanKind = config.traceApi.SpanKind
			} else if (resolved?.module) {
				otelContext = resolved.module.context
				otelTrace = resolved.module.trace
				otelPropagation = resolved.module.propagation
				SpanStatusCode = resolved.module.SpanStatusCode
				SpanKind = resolved.module.SpanKind
			}

			const turnRootSpan = config.turnRootSpan ?? context.turnRootSpan

			const backend = createOtelSpanBackend({
				tracer,
				context: otelContext,
				trace: otelTrace,
				SpanStatusCode,
				SpanKind,
				propagation: otelPropagation,
			})

			if (backend) {
				traceMapper = createTraceMapper({
					backend,
					isError,
					turnRootSpan,
					onTurnContext(_turnId, carrier) {
						const bridge = context.traceContextBridge
						if (!bridge) return
						if (carrier) {
							bridge.setHeaderInjector(() => carrier)
						} else {
							bridge.setHeaderInjector(null)
						}
					},
				})
			}

			if (meter) {
				initMetricInstruments(meter)
			}

			this.available = Boolean(traceMapper)
		},

		onEvent(event) {
			traceMapper?.handleEvent(event)
		},

		onPhaseEnd(phaseEvent) {
			void phaseEvent
		},

		onMetric(metric) {
			recordOtelMetric(metric)
		},

		destroy() {
			traceMapper?.destroy()
			traceMapper = null
			counters.clear()
			histograms.clear()
			gauges.clear()
		},
	}

	function initMetricInstruments(activeMeter) {
		histograms.set(SEVO_METRICS.TURN_DURATION, activeMeter.createHistogram(SEVO_METRICS.TURN_DURATION, {
			description: 'Conversation turn duration',
			unit: 'ms',
		}))
		histograms.set(SEVO_METRICS.PHASE_DURATION, activeMeter.createHistogram(SEVO_METRICS.PHASE_DURATION, {
			description: 'Phase duration within a turn',
			unit: 'ms',
		}))
		counters.set(SEVO_METRICS.TURNS_TOTAL, activeMeter.createCounter(SEVO_METRICS.TURNS_TOTAL, {
			description: 'Turn outcomes',
		}))
		counters.set(SEVO_METRICS.EVENTS_DROPPED, activeMeter.createCounter(SEVO_METRICS.EVENTS_DROPPED, {
			description: 'Telemetry events dropped by policy',
		}))
		counters.set(SEVO_METRICS.EVENTS_EMITTED, activeMeter.createCounter(SEVO_METRICS.EVENTS_EMITTED, {
			description: 'Semantic events emitted',
		}))
		counters.set(SEVO_METRICS.EXPORTER_ERRORS, activeMeter.createCounter(SEVO_METRICS.EXPORTER_ERRORS, {
			description: 'Exporter handler errors',
		}))
		counters.set(SEVO_METRICS.SESSION_TURNS_TOTAL, activeMeter.createCounter(SEVO_METRICS.SESSION_TURNS_TOTAL, {
			description: 'Turn outcomes rolled up at session boundary',
		}))

		if (typeof activeMeter.createGauge === 'function') {
			gauges.set(SEVO_METRICS.STATE_GAUGE, activeMeter.createGauge(SEVO_METRICS.STATE_GAUGE, {
				description: 'Host state gauge from stateProvider',
			}))
			gauges.set(SEVO_METRICS.ACTIVE_TURNS, activeMeter.createGauge(SEVO_METRICS.ACTIVE_TURNS, {
				description: 'Open conversation turns',
			}))
		}
	}

	function recordOtelMetric(metric) {
		if (!metric) return

		const attributes = sevoMetricLabelAttributes(metric.labels)

		if (metric.type === 'histogram') {
			histograms.get(metric.name)?.record(metric.value, attributes)
			return
		}

		if (metric.type === 'gauge') {
			const gauge = gauges.get(metric.name)
			gauge?.record(metric.value, attributes)
			return
		}

		if (metric.type === 'counter') {
			counters.get(metric.name)?.add(metric.value ?? 1, attributes)
		}
	}
}
