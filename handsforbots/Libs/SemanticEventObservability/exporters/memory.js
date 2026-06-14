export function createMemoryExporter(config = {}) {
	const id = 'memory'
	let buffer = config.buffer || null

	return {
		id,
		available: true,
		description: 'Ring buffer used by dev panel and debug export',

		async init(context) {
			buffer = context.buffer
		},

		onEvent(event) {
			buffer?.push(event)
		},

		onMetric(metric) {
			buffer?.pushMetric(metric)
		},
	}
}
