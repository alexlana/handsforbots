import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWebVitalsExporter } from '../exporters/webVitals.js'
import { createMetricsRegistry, SEVO_METRICS } from '../core/MetricsRegistry.js'

test('webVitals exporter records sevo_web_vital via injected onReport', async () => {
	const records = []
	const metricsRegistry = createMetricsRegistry({ environment: 'test' })
	metricsRegistry.subscribe((metric) => records.push(metric))

	let capturedReport = null
	const exporter = createWebVitalsExporter({
		onReport(report) {
			capturedReport = report
		},
	})

	await exporter.init({ metricsRegistry })
	assert.equal(exporter.available, true)

	capturedReport({
		name: 'LCP',
		value: 1234,
		rating: 'good',
		navigationType: 'navigate',
	})

	assert.equal(records.length, 1)
	assert.equal(records[0].name, SEVO_METRICS.WEB_VITAL)
	assert.equal(records[0].value, 1234)
	assert.equal(records[0].labels.vital, 'LCP')
	assert.equal(records[0].labels.rating, 'good')
})

test('webVitals exporter registers web-vitals module callbacks', async () => {
	const records = []
	const metricsRegistry = createMetricsRegistry({ environment: 'test' })
	metricsRegistry.subscribe((metric) => records.push(metric))

	const registered = []
	const vitals = {
		onLCP(fn) { registered.push(['LCP', fn]) },
		onINP(fn) { registered.push(['INP', fn]) },
		onCLS(fn) { registered.push(['CLS', fn]) },
	}

	const exporter = createWebVitalsExporter({ vitals })
	await exporter.init({ metricsRegistry })

	assert.equal(exporter.available, true)
	assert.equal(registered.length, 3)

	registered[0][1]({ name: 'LCP', value: 900, rating: 'good' })
	assert.equal(records[0].labels.vital, 'LCP')
})
