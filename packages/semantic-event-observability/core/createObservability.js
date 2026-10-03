import { getPackageIdentity } from '../packageIdentity.js'
import CorrelationContext from './CorrelationContext.js'
import Policy from './Policy.js'
import EventBuffer from './EventBuffer.js'
import { createMetricsRegistry } from './MetricsRegistry.js'
import { createPhaseTracker } from './PhaseTracker.js'
import { definePhaseModel } from './definePhaseModel.js'
import { defineTurnModel } from './TurnModel.js'
import { createTraceContextBridge } from './TraceContextBridge.js'
import { createEventInstrumentation } from './eventInstrumentation.js'
import { createSessionTracker } from './SessionTracker.js'
import { isErrorEvent } from './isErrorEvent.js'
import { bucketEventName } from './bucketEventName.js'
import { createExporters, initExporters } from '../exporters/index.js'
import { createId } from '../utils/id.js'

const DEFAULT_EXPORTERS = ['memory']

/**
 * Create a semantic observability instance for async event systems.
 */
export function createObservability(options = {}) {
	const identity = getPackageIdentity(options.identity)
	const environment = options.environment || 'development'
	const phases = definePhaseModel(options.phases || [])
	const isError = options.isError || isErrorEvent
	const eventInstrumentation = createEventInstrumentation({
		eventFilter: options.eventFilter,
		eventAllowlist: options.eventAllowlist,
	})
	const metricsRegistry = createMetricsRegistry({ environment })

	const policy = new Policy({
		enabled: options.enabled !== false,
		sampleRate: options.sampleRate,
		maxEventsPerMinute: options.maxEventsPerMinute,
		maxPayloadBytes: options.maxPayloadBytes,
		denylist: options.denylist,
		environment,
		onDrop: (reason) => metricsRegistry.recordEventDropped(reason),
	})

	const correlation = new CorrelationContext({
		sessionId: options.sessionId,
		turnModel: options.turn || defineTurnModel({
			startEvents: options.turnStartEvents,
			endEvents: options.turnEndEvents,
		}),
		turnStartEvents: options.turnStartEvents || [],
		turnEndEvents: options.turnEndEvents || [],
	})

	const traceContextBridge = createTraceContextBridge({
		getContext: () => correlation.getContext(),
	})

	const sessionEndEvents = new Set((options.sessionEndEvents || []).map(String))
	const customMetricAllowlist = options.customMetricAllowlist
		? new Set(options.customMetricAllowlist.map(String))
		: null
	const sessionTracker = createSessionTracker()
	const turnRootSpan = options.turnRootSpan

	const buffer = new EventBuffer(options.bufferSize || 200)
	let exporters = []
	let exporterStatus = []
	let stateProvider = null
	let initialized = false
	let initPromise = null

	const api = {
		identity,
		policy,
		correlation,
		buffer,
		metricsRegistry,
		phases,
		isError,
		eventInstrumentation,
		traceContextBridge,
		sessionTracker,
		sessionEndEvents,
		exporters: [],
	}

	const phaseTracker = createPhaseTracker({
		phases,
		isError,
		onPhaseStart: (data) => {
			emitEvent(api, buildPhaseEvent(api, 'phase.start', data))
		},
		onPhaseWait: (data) => {
			metricsRegistry.recordPhaseWait(data.phase, data.waitMs, data.labels)
		},
		onPhaseEnd: (data) => {
			metricsRegistry.recordPhaseDuration(data.phase, data.durationMs, data.labels)
			const event = buildPhaseEvent(api, 'phase.end', data)
			emitEvent(api, event)
			dispatchPhaseEnd(api, event)
		},
		onRenderDuration: (durationMs, labels) => {
			metricsRegistry.recordPhaseDuration('render', durationMs, labels)
			const ctx = correlation.getContext()
			if (!ctx.turnId) return
			const event = buildPhaseEvent(api, 'phase.end', {
				turnId: ctx.turnId,
				phase: 'render',
				durationMs,
				source: 'computed',
				labels,
			})
			emitEvent(api, event)
			dispatchPhaseEnd(api, event)
		},
		onTurnStatus: (status, labels) => {
			metricsRegistry.recordTurnStatus(status, labels)
		},
	})

	api.phaseTracker = phaseTracker
	api.traceContext = traceContextBridge
	api.sessionTracker = sessionTracker

	metricsRegistry.subscribe((metric) => {
		buffer.pushMetric(metric)
		for (const exporter of exporters) {
			dispatchMetric(exporter, metric, metricsRegistry)
		}
	})

	Object.assign(api, {
		async init() {
			if (initialized) return exporterStatus
			if (initPromise) return initPromise

			initPromise = (async () => {
				const requested = options.exporters || DEFAULT_EXPORTERS
				exporters = await createExporters(requested, options.exporterConfig || {})
				if (Array.isArray(options.customExporters)) {
					exporters.push(...options.customExporters)
				}
				api.exporters = exporters
				exporterStatus = await initExporters(exporters, createContext())
				initialized = true
				publishGlobal(api, identity)
				return exporterStatus
			})()

			return initPromise
		},

		instrument(bus, instrumentOptions = {}) {
			stateProvider = instrumentOptions.stateProvider || null
			api.stateProvider = stateProvider

			if (!bus || typeof bus.trigger !== 'function' || typeof bus.on !== 'function') {
				throw new Error('instrument() expects an event bus with on() and trigger()')
			}

			const originalTrigger = bus.trigger.bind(bus)
			bus.trigger = function instrumentedTrigger(name, args) {
				recordBusEvent(api, name, args, 'bus.trigger')
				return originalTrigger(name, args)
			}

			if (instrumentOptions.wrapListeners === true) {
				const originalOn = bus.on.bind(bus)
				bus.on = function instrumentedOn(names, callback) {
					const wrapped = function wrappedCallback(...listenerArgs) {
						const started = Date.now()
						try {
							recordBusEvent(api, names, listenerArgs, 'bus.listener')
							return callback.apply(this, listenerArgs)
						} finally {
							api.metricsRegistry.recordListenerDuration(Date.now() - started, {
								event: bucketEventName(normalizeEventName(names)),
							})
						}
					}
					return originalOn(names, wrapped)
				}
			}

			return bus
		},

		record(name, payload = {}, meta = {}) {
			emit(api, {
				type: meta.type || 'custom',
				name,
				payload,
			})
		},

		recordMetric(name, value, labels = {}) {
			if (!policy.shouldEmit('metric.gauge')) return

			const metric = {
				name,
				value,
				labels: { environment, ...labels },
				type: 'gauge',
				timestamp: new Date().toISOString(),
				sessionId: correlation.sessionId,
			}

			buffer.pushMetric(metric)
			for (const exporter of api.exporters) {
				dispatchMetric(exporter, metric, metricsRegistry)
			}

			if (customMetricAllowlist?.has(String(name))) {
				metricsRegistry.recordCustomMetric(String(name), labels)
			}
		},

		startPhase(phaseId, labels = {}) {
			const { turnId } = correlation.getContext()
			if (!turnId) return false
			return phaseTracker.startPhase(turnId, phaseId, {
				environment,
				...labels,
			})
		},

		endPhase(phaseId, labels = {}) {
			const { turnId } = correlation.getContext()
			if (!turnId) return false
			return phaseTracker.endPhase(turnId, phaseId, {
				environment,
				...labels,
			})
		},

		getTraceHeaders() {
			return traceContextBridge.getTraceHeaders()
		},

		withTraceContext(input, init = {}) {
			return traceContextBridge.withTraceContext(input, init)
		},

		withFetch(input, init = {}) {
			return traceContextBridge.withFetch(input, init)
		},

		async registerExporter(exporter) {
			if (!exporter?.id) {
				throw new Error('registerExporter expects an exporter with id')
			}

			exporters.push(exporter)
			api.exporters = exporters

			try {
				await exporter.init?.(createContext())
				const status = {
					id: exporter.id,
					available: exporter.available !== false,
					description: exporter.description,
				}
				exporterStatus.push(status)
				return status
			} catch (error) {
				const status = {
					id: exporter.id,
					available: false,
					error: error?.message || String(error),
				}
				exporterStatus.push(status)
				return status
			}
		},

		endSession(reason = 'manual') {
			return finalizeSession(api, sessionTracker, reason)
		},

		getTimeline(limit) {
			return buffer.getTimeline(limit)
		},

		getMetrics(limit) {
			return buffer.getMetrics(limit)
		},

		getPolicyStats() {
			return policy.getStats()
		},

		getExporterStatus() {
			return exporterStatus
		},

		destroy() {
			for (const exporter of api.exporters) {
				try { exporter.destroy?.() } catch { /* noop */ }
			}
			exporters = []
			api.exporters = []
			phaseTracker.clear()
			buffer.clear()
			removeGlobal(identity)
		},
	})

	function createContext() {
		return {
			identity,
			buffer,
			phases,
			metricsRegistry,
			isError,
			traceContextBridge,
			turnRootSpan,
			getTimeline: api.getTimeline,
			getMetrics: api.getMetrics,
			getPolicyStats: api.getPolicyStats,
		}
	}

	api.init().catch(() => {})

	return api
}

function buildPhaseEvent(api, type, data) {
	const ctx = api.correlation.getContext()
	return {
		type,
		name: `phase:${data.phase}`,
		phase: data.phase,
		source: data.source,
		durationMs: data.durationMs,
		sessionId: ctx.sessionId,
		turnId: data.turnId || ctx.turnId,
		traceId: ctx.traceId,
		turnMetadata: ctx.turnMetadata,
	}
}

function recordBusEvent(api, name, args, type) {
	const eventName = normalizeEventName(name)
	const payload = Array.isArray(args) ? args[0] : args

	if (type === 'bus.trigger') {
		api.metricsRegistry.recordBusEvent(bucketEventName(eventName))
	}

	emit(api, { type, name: eventName, payload })
}

function emit(api, partial) {
	const { correlation } = api

	if (partial.type !== 'bus.trigger') {
		emitEvent(api, { ...partial, ...correlation.getContext() })
		return
	}

	const snapshotBefore = correlation.getContext()
	const correlationChange = correlation.observeBusEvent(partial.name)

	if (api.sessionEndEvents?.has(partial.name)) {
		finalizeSession(api, api.sessionTracker, partial.name)
	}

	if (correlationChange?.abandoned) {
		handleTurnAbandoned(api, correlationChange.abandoned)
		handleTurnStart(api, partial, correlationChange.started)
		if (api.eventInstrumentation.shouldRecord(partial.name)) {
			emitEvent(api, { ...partial, ...correlation.getContext() })
		}
		return
	}

	if (correlationChange?.type === 'turn.start') {
		handleTurnStart(api, partial, correlationChange)
		if (api.eventInstrumentation.shouldRecord(partial.name)) {
			emitEvent(api, { ...partial, ...correlation.getContext() })
		}
		return
	}

	if (correlationChange?.type === 'turn.end') {
		if (api.eventInstrumentation.shouldRecord(partial.name)) {
			emitEvent(api, { ...partial, ...snapshotBefore })
		}
		handleTurnEnd(api, partial, snapshotBefore, correlationChange.durationMs)
		return
	}

	if (!api.eventInstrumentation.shouldRecord(partial.name)) {
		return
	}

	emitEvent(api, { ...partial, ...correlation.getContext() })
}

function finalizeSession(api, sessionTracker, reason) {
	const counts = sessionTracker.getCounts()
	const endedSessionId = api.correlation.sessionId

	api.metricsRegistry.recordSessionTurnsRollup(counts, {
		reason: reason || 'manual',
	})
	sessionTracker.reset()
	api.correlation.startSession()

	emitEvent(api, {
		type: 'session.end',
		name: String(reason || 'session.end'),
		sessionId: endedSessionId,
		payloadSummary: { completed: counts.completed, abandoned: counts.abandoned },
	})

	return counts
}

function handleTurnAbandoned(api, abandoned) {
	const labels = metricLabels(api, abandoned)
	api.metricsRegistry.recordTurnStatus('abandoned', labels)
	api.sessionTracker?.recordTurn('abandoned')
	api.phaseTracker.onTurnAbandoned(abandoned)
	emitEvent(api, {
		type: 'turn.abandoned',
		name: 'turn.abandoned',
		...abandoned,
		sessionId: api.correlation.sessionId,
	})
}

function handleTurnStart(api, partial, started) {
	const plugin = extractPluginFromPayload(partial.payload)
	if (plugin) api.correlation.setTurnMetadata({ input_plugin: plugin })

	api.metricsRegistry.recordActiveTurns(1)
	api.phaseTracker.onTurnStart({ ...started, name: partial.name })
	emitEvent(api, {
		type: 'turn.start',
		name: partial.name,
		...started,
		sessionId: api.correlation.sessionId,
	})
}

function handleTurnEnd(api, partial, snapshot, durationMs) {
	const labels = metricLabels(api, {
		...snapshot,
		name: partial.name,
		turnMetadata: snapshot.turnMetadata,
	})
	api.metricsRegistry.recordTurnDuration(durationMs, labels)
	api.metricsRegistry.recordActiveTurns(0)
	api.sessionTracker?.recordTurn('completed')
	api.phaseTracker.onTurnEnd({ ...snapshot, name: partial.name, durationMs }, labels)
	emitEvent(api, {
		type: 'turn.end',
		name: partial.name,
		...snapshot,
		durationMs,
	})
}

function emitEvent(api, partial) {
	const { policy, buffer } = api
	if (!policy.shouldEmit(partial.type)) return

	const labels = metricLabels(api, partial)
	const event = {
		id: createId('evt'),
		timestamp: new Date().toISOString(),
		environment: policy.environment,
		payloadSummary: policy.sanitizePayload(partial.payload),
		state: api.stateProvider?.() || undefined,
		...partial,
	}

	buffer.push(event)
	recordStateMetrics(api, event.state)
	api.metricsRegistry.recordEventEmitted(event.type)

	if (event.type === 'bus.trigger' && event.turnId) {
		api.phaseTracker.onBusEvent(event, labels)
	}

	for (const exporter of api.exporters) {
		dispatchEvent(exporter, event, api.metricsRegistry)
	}
}

function recordStateMetrics(api, state) {
	if (!state || typeof state !== 'object') return
	for (const [key, value] of Object.entries(state)) {
		if (typeof value === 'number' && !Number.isNaN(value)) {
			api.metricsRegistry.recordStateGauge(key, value)
		}
	}
}

function metricLabels(api, event) {
	const labels = { environment: api.policy.environment }
	if (event?.name) labels.start_event = event.name
	if (event?.phase) labels.phase = event.phase
	if (event?.source) labels.source = event.source

	const metadata = event?.turnMetadata || api.correlation.getContext().turnMetadata
	if (metadata?.input_plugin) labels.input_plugin = metadata.input_plugin

	const plugin = extractPluginFromPayload(event?.payload)
	if (plugin) labels.input_plugin = plugin

	return labels
}

function extractPluginFromPayload(payload) {
	if (!payload) return undefined
	const item = Array.isArray(payload) ? payload[0] : payload
	if (item?.plugin) return String(item.plugin)
	return undefined
}

function dispatchEvent(exporter, event, metricsRegistry) {
	try {
		exporter.onEvent?.(event)
	} catch {
		metricsRegistry.recordExporterError(exporter.id)
	}
}

function dispatchPhaseEnd(api, event) {
	for (const exporter of api.exporters) {
		try {
			exporter.onPhaseEnd?.(event)
		} catch {
			api.metricsRegistry.recordExporterError(exporter.id)
		}
	}
}

function dispatchMetric(exporter, metric, metricsRegistry) {
	try {
		exporter.onMetric?.(metric)
	} catch {
		metricsRegistry.recordExporterError(exporter.id)
	}
}

function normalizeEventName(name) {
	if (typeof name === 'string') return name
	return String(name)
}

function publishGlobal(api, identity) {
	if (typeof globalThis === 'undefined') return
	globalThis[identity.globalKey] = {
		getTimeline: () => api.getTimeline(),
		getMetrics: () => api.getMetrics(),
		getExporterStatus: () => api.getExporterStatus(),
		getPolicyStats: () => api.getPolicyStats(),
	}
}

function removeGlobal(identity) {
	if (typeof globalThis === 'undefined') return
	delete globalThis[identity.globalKey]
}
