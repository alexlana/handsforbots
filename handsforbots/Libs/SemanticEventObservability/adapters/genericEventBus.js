/**
 * Generic adapter for event buses exposing on() and trigger().
 */
export function instrumentEventBus(observability, bus, options = {}) {
	return observability.instrument(bus, options)
}

/**
 * Convenience helper to bootstrap observability + bus instrumentation in one call.
 */
export function createInstrumentedBus(bus, options = {}) {
	const { createObservability } = options
	if (typeof createObservability !== 'function') {
		throw new Error('createInstrumentedBus requires createObservability in options')
	}

	const observability = createObservability(options.observability || {})
	observability.instrument(bus, options.instrument || {})
	return { observability, bus }
}
