import { createObservability } from '../core/createObservability.js'

/**
 * Minimal in-memory bus for integration tests and examples.
 */
export function createTestBus() {
	const listeners = new Map()

	return {
		on(name, callback) {
			const key = String(name)
			if (!listeners.has(key)) listeners.set(key, [])
			listeners.get(key).push(callback)
		},
		trigger(name, args) {
			const key = String(name)
			for (const callback of listeners.get(key) || []) {
				callback(...(Array.isArray(args) ? args : [args]))
			}
		},
	}
}

/**
 * Bootstrap observability + bus for tests. Uses memory exporter by default.
 */
export function createTestObservability(options = {}) {
	const bus = options.bus || createTestBus()
	const observability = createObservability({
		environment: 'test',
		exporters: ['memory'],
		...options.observability,
	})

	observability.instrument(bus, options.instrument || {})

	return {
		bus,
		observability,
		async init() {
			return observability.init()
		},
	}
}
