import { getPackageIdentity } from '../packageIdentity.js'
import CorrelationContext from './CorrelationContext.js'
import Policy from './Policy.js'
import EventBuffer from './EventBuffer.js'
import { createMetricsRegistry } from './MetricsRegistry.js'
import { createTurnMetricsCollector } from './TurnMetricsCollector.js'
import { definePhaseModel } from './definePhaseModel.js'
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
		turnStartEvents: options.turnStartEvents || [],
		turnEndEvents: options.turnEndEvents || [],
	})

	const buffer = new EventBuffer(options.bufferSize || 200)
	let exporters = []
	let exporterStatus = []
	let stateProvider = null
	let initialized = false
	let initPromise = null

	const turnMetrics = createTurnMetricsCollector({
		phases,
		onPhaseDuration: (phase, durationMs, labels) => {
			metricsRegistry.recordPhaseDuration(phase, durationMs, labels)
		},
		onRenderDuration: (durationMs, labels) => {
			metricsRegistry.recordPhaseDuration('render', durationMs, labels)
		},
		onTurnStatus: (status, labels) => {
			metricsRegistry.recordTurnStatus(status, labels)
		},
	})

	metricsRegistry.subscribe((metric) => {
		buffer.pushMetric(metric)
		for (const exporter of exporters) {
			dispatchMetric(exporter, metric, metricsRegistry)
		}
	})

	const api = {
		identity,
		policy,
		correlation,
		buffer,
		metricsRegistry,
		turnMetrics,
		phases,
		exporters: [],

		async init() {
			if (initialized) return exporterStatus
			if (initPromise) return initPromise

			initPromise = (async () => {
				const requested = options.exporters || DEFAULT_EXPORTERS
				exporters = await createExporters(requested, options.exporterConfig || {})
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
						recordBusEvent(api, names, listenerArgs, 'bus.listener')
						return callback.apply(this, listenerArgs)
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
			turnMetrics.clear()
			buffer.clear()
			removeGlobal(identity)
		},
	}

	function createContext() {
		return {
			identity,
			buffer,
			phases,
			metricsRegistry,
			getTimeline: api.getTimeline,
			getMetrics: api.getMetrics,
			getPolicyStats: api.getPolicyStats,
		}
	}

	api.init().catch(() => {})

	return api
}

function recordBusEvent(api, name, args, type) {
	const eventName = normalizeEventName(name)
	const payload = Array.isArray(args) ? args[0] : args
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

	if (correlationChange?.abandoned) {
		handleTurnAbandoned(api, correlationChange.abandoned)
		handleTurnStart(api, partial, correlationChange.started)
		emitEvent(api, { ...partial, ...correlation.getContext() })
		return
	}

	if (correlationChange?.type === 'turn.start') {
		handleTurnStart(api, partial, correlationChange)
		emitEvent(api, { ...partial, ...correlation.getContext() })
		return
	}

	if (correlationChange?.type === 'turn.end') {
		emitEvent(api, { ...partial, ...snapshotBefore })
		handleTurnEnd(api, partial, snapshotBefore, correlationChange.durationMs)
		return
	}

	emitEvent(api, { ...partial, ...correlation.getContext() })
}

function handleTurnAbandoned(api, abandoned) {
	const labels = metricLabels(api, abandoned)
	api.metricsRegistry.recordTurnStatus('abandoned', labels)
	api.turnMetrics?.onTurnAbandoned(abandoned)
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

	const labels = metricLabels(api, { ...started, name: partial.name, payload: partial.payload })
	api.turnMetrics.onTurnStart({ ...started, name: partial.name })
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
	api.turnMetrics.onTurnEnd({ ...snapshot, name: partial.name, durationMs }, labels)
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
		api.turnMetrics.onBusEvent(event, metricLabels(api, event))
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
