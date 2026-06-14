export function createConsoleExporter(config = {}) {
	const id = 'console'
	const level = config.level || 'debug'
	const prefix = config.prefix || '[seo]'

	return {
		id,
		available: true,
		description: 'Structured console output for local debugging',

		async init() {},

		onEvent(event) {
			const logger = console[level] || console.log
			logger(`${prefix} ${event.type}`, {
				name: event.name,
				turnId: event.turnId,
				traceId: event.traceId,
				payload: event.payloadSummary,
				state: event.state,
			})
		},

		onMetric(metric) {
			const logger = console[level] || console.log
			logger(`${prefix} metric`, metric)
		},
	}
}
