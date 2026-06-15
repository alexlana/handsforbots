import { getPackageIdentity } from '../packageIdentity.js'
import CorrelationContext from './CorrelationContext.js'
import Policy from './Policy.js'
import EventBuffer from './EventBuffer.js'
import { createExporters, initExporters } from '../exporters/index.js'
import { createId } from '../utils/id.js'

const DEFAULT_EXPORTERS = ['memory']

/**
 * Create a semantic observability instance for async event systems.
 */
export function createObservability(options = {}) {
	const identity = getPackageIdentity(options.identity)
	const policy = new Policy({
		enabled: options.enabled !== false,
		sampleRate: options.sampleRate,
		maxEventsPerMinute: options.maxEventsPerMinute,
		maxPayloadBytes: options.maxPayloadBytes,
		denylist: options.denylist,
		environment: options.environment,
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

	const api = {
		identity,
		policy,
		correlation,
		buffer,
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
				labels,
				timestamp: new Date().toISOString(),
				sessionId: correlation.sessionId,
			}

			buffer.pushMetric(metric)
			for (const exporter of api.exporters) {
				try { exporter.onMetric?.(metric) } catch { /* noop */ }
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
			buffer.clear()
			removeGlobal(identity)
		},
	}

	function createContext() {
		return {
			identity,
			buffer,
			getTimeline: api.getTimeline,
			getMetrics: api.getMetrics,
			getPolicyStats: api.getPolicyStats,
		}
	}

	// Fire-and-forget init; absence of exporters never breaks the host app.
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

	if (correlationChange?.type === 'turn.start') {
		emitEvent(api, {
			type: 'turn.start',
			name: partial.name,
			...correlation.getContext(),
		})
		emitEvent(api, { ...partial, ...correlation.getContext() })
		return
	}

	if (correlationChange?.type === 'turn.end') {
		emitEvent(api, { ...partial, ...snapshotBefore })
		emitEvent(api, {
			type: 'turn.end',
			name: partial.name,
			...snapshotBefore,
			durationMs: correlationChange.durationMs,
		})
		return
	}

	emitEvent(api, { ...partial, ...correlation.getContext() })
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
	for (const exporter of api.exporters) {
		try { exporter.onEvent?.(event) } catch { /* noop */ }
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
