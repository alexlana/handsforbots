import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bucketEventName } from '../core/bucketEventName.js'
import { createMetricsRegistry, SEVO_METRICS } from '../core/MetricsRegistry.js'
import { createPhaseTracker } from '../core/PhaseTracker.js'
import { definePhaseModel } from '../core/definePhaseModel.js'
import { createTestObservability } from './testHarness.js'

test('bucketEventName trims long and dynamic segments', () => {
	assert.equal(bucketEventName('core.input'), 'core.input')
	assert.equal(bucketEventName('event-123456789012345678901234567890'), 'event-*')
})

test('MetricsRegistry records phase wait and bus events', () => {
	const records = []
	const registry = createMetricsRegistry({ environment: 'test' })
	registry.subscribe((metric) => records.push(metric))

	registry.recordPhaseWait('backend', 50, {})
	registry.recordBusEvent('core.input', {})
	registry.recordCustomMetric('hfb_input_total', {})
	registry.recordListenerDuration(12, { event: 'core.input' })

	assert.ok(records.some((m) => m.name === SEVO_METRICS.PHASE_WAIT && m.value === 50))
	assert.ok(records.some((m) => m.name === SEVO_METRICS.BUS_EVENTS_TOTAL))
	assert.ok(records.some((m) => m.name === SEVO_METRICS.CUSTOM_METRICS_TOTAL))
	assert.ok(records.some((m) => m.name === SEVO_METRICS.LISTENER_DURATION))
})

test('PhaseTracker emits phase wait from turn start to phase start', () => {
	const waits = []
	const tracker = createPhaseTracker({
		phases: definePhaseModel([
			{ id: 'backend', startEvent: 'api.call', endEvent: 'api.done' },
		]),
		onPhaseStart: () => {},
		onPhaseWait: (data) => waits.push(data),
		onPhaseEnd: () => {},
		onRenderDuration: () => {},
		onTurnStatus: () => {},
	})

	tracker.onTurnStart({ turnId: 't1' })
	tracker.onBusEvent({ turnId: 't1', name: 'api.call' })

	assert.equal(waits.length, 1)
	assert.equal(waits[0].phase, 'backend')
	assert.ok(waits[0].waitMs >= 0)
})

test('createObservability records bus events and custom metrics allowlist', async () => {
	const { observability, bus, init } = createTestObservability({
		observability: {
			turnStartEvents: ['user.message'],
			turnEndEvents: ['bot.response'],
			customMetricAllowlist: ['hfb_input_total'],
			exporters: [],
		},
	})

	await init()
	bus.trigger('user.message', [])
	bus.trigger('noop.event', [])
	observability.recordMetric('hfb_input_total', 1, { plugin: 'Text' })
	observability.recordMetric('ignored_metric', 1)

	const names = observability.getMetrics().map((m) => m.name)
	assert.ok(names.includes(SEVO_METRICS.BUS_EVENTS_TOTAL))
	assert.ok(names.includes(SEVO_METRICS.CUSTOM_METRICS_TOTAL))
	assert.equal(
		observability.getMetrics().filter((m) => m.name === SEVO_METRICS.CUSTOM_METRICS_TOTAL).length,
		1,
	)
})

test('wrapListeners records sevo_listener_duration_ms', async () => {
	const { observability, bus, init } = createTestObservability({
		observability: {
			exporters: [],
		},
		instrument: { wrapListeners: true },
	})

	await init()

	bus.on('slow.event', () => {
		const start = Date.now()
		while (Date.now() - start < 5) { /* busy wait */ }
	})

	bus.trigger('slow.event', [])

	const metric = observability.getMetrics().find((m) => m.name === SEVO_METRICS.LISTENER_DURATION)
	assert.ok(metric)
	assert.ok(metric.value >= 5)
})
