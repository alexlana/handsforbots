import { resolveOptionalDependency } from '../utils/probeOptional.js'

const DEFAULT_VITALS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB']

/**
 * Web Vitals exporter (optional dependency).
 * Subscribes to web-vitals callbacks and records sevo_web_vital histograms.
 */
export function createWebVitalsExporter(config = {}) {
	const id = 'webVitals'
	let metricsRegistry = null
	let reportHandler = null
	const subscribed = []

	return {
		id,
		available: false,
		description: 'Bridge Core Web Vitals into sevo_web_vital metrics',

		async init(context) {
			metricsRegistry = context.metricsRegistry
			reportHandler = createReportHandler(config, metricsRegistry)

			if (typeof config.onReport === 'function') {
				config.onReport(reportHandler)
				this.available = true
				return
			}

			const resolved = await resolveOptionalDependency(config.vitals, {
				moduleSpecifier: 'web-vitals',
			})

			if (!resolved?.module) return

			const vitals = resolved.module
			const names = config.metrics || DEFAULT_VITALS

			for (const name of names) {
				const register = vitals[`on${name}`]
				if (typeof register !== 'function') continue
				register(reportHandler)
				subscribed.push(name)
			}

			this.available = subscribed.length > 0
		},

		onEvent() {},

		onMetric() {},

		destroy() {
			subscribed.length = 0
		},
	}
}

function createReportHandler(config, metricsRegistry) {
	return function reportWebVital(metric) {
		if (!metric || metricsRegistry?.recordWebVital == null) return

		const labels = {
			rating: metric.rating,
			navigationType: metric.navigationType,
			...(config.labels || {}),
		}

		metricsRegistry.recordWebVital(metric.name, metric.value, labels)

		config.onVital?.(metric)
	}
}
