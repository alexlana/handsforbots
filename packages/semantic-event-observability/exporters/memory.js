export function createMemoryExporter(config = {}) {
	const id = 'memory'

	return {
		id,
		available: true,
		description: 'Ring buffer used by dev panel and debug export (buffer owned by core)',

		async init(context) {
			// Buffer is populated by createObservability; memory exporter is a marker for dev tooling.
			void context.buffer
		},

		onEvent() {},

		onMetric() {},
	}
}
