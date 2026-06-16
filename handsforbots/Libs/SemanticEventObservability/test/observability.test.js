import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createObservability } from '../core/createObservability.js'
import { createMetricsRegistry, SEO_METRICS } from '../core/MetricsRegistry.js'
import { createTurnMetricsCollector } from '../core/TurnMetricsCollector.js'
import { definePhaseModel } from '../core/definePhaseModel.js'
import CorrelationContext from '../core/CorrelationContext.js'

test('MetricsRegistry records canonical seo_* metrics', () => {
	const records = []
	const registry = createMetricsRegistry({ environment: 'test' })
	registry.subscribe((metric) => records.push(metric))

	registry.recordTurnDuration(1200, { input_plugin: 'Text' })
	registry.recordPhaseDuration('backend', 800, {})
	registry.recordTurnStatus('completed', {})
	registry.recordEventDropped('sampled_out')

	assert.equal(records.length, 4)
	assert.equal(records[0].name, SEO_METRICS.TURN_DURATION)
	assert.equal(records[0].type, 'histogram')
	assert.equal(records[0].value, 1200)
	assert.equal(records[0].labels.input_plugin, 'Text')
	assert.equal(records[3].labels.reason, 'sampled_out')
})

test('CorrelationContext detects abandoned turns', () => {
	const correlation = new CorrelationContext({
		turnStartEvents: ['user.message'],
		turnEndEvents: ['bot.response'],
	})

	const first = correlation.observeBusEvent('user.message')
	assert.equal(first.type, 'turn.start')

	const abandoned = correlation.observeBusEvent('user.message')
	assert.ok(abandoned.abandoned)
	assert.equal(abandoned.started.type, 'turn.start')
	assert.notEqual(abandoned.abandoned.turnId, abandoned.started.turnId)
})

test('TurnMetricsCollector records phase and render durations', () => {
	const phases = definePhaseModel([
		{ id: 'backend', startEvent: 'api.call', endEvent: 'api.done' },
	])
	const phaseDurations = []
	const renderDurations = []

	const collector = createTurnMetricsCollector({
		phases,
		onPhaseDuration: (phase, ms) => phaseDurations.push({ phase, ms }),
		onRenderDuration: (ms) => renderDurations.push(ms),
		onTurnStatus: () => {},
	})

	collector.onTurnStart({ turnId: 'turn-1' })
	collector.onBusEvent({ turnId: 'turn-1', name: 'api.call' })
	collector.onBusEvent({ turnId: 'turn-1', name: 'api.done' })
	collector.onTurnEnd({ turnId: 'turn-1' })

	assert.equal(phaseDurations.length, 1)
	assert.equal(phaseDurations[0].phase, 'backend')
	assert.ok(phaseDurations[0].ms >= 0)
	assert.equal(renderDurations.length, 1)
})

test('createObservability emits turn metrics on instrumented bus', async () => {
	const bus = createBus()
	const observability = createObservability({
		environment: 'test',
		turnStartEvents: ['user.message'],
		turnEndEvents: ['bot.response'],
		phases: definePhaseModel([
			{ id: 'backend', startEvent: 'api.call', endEvent: 'api.done' },
		]),
		exporters: [],
	})

	observability.instrument(bus, {
		stateProvider: () => ({ queueDepth: 2 }),
	})
	await observability.init()

	bus.trigger('user.message', [{ plugin: 'Text', text: 'hi' }])
	bus.trigger('api.call', [])
	bus.trigger('api.done', [])
	bus.trigger('bot.response', [{ text: 'hello' }])

	const metrics = observability.getMetrics()
	const names = metrics.map((metric) => metric.name)

	assert.ok(names.includes(SEO_METRICS.TURN_DURATION))
	assert.ok(names.includes(SEO_METRICS.PHASE_DURATION))
	assert.ok(names.includes(SEO_METRICS.TURNS_TOTAL))
	assert.ok(names.includes(SEO_METRICS.STATE_GAUGE))
	assert.ok(names.includes(SEO_METRICS.EVENTS_EMITTED))

	const completed = metrics.find(
		(metric) => metric.name === SEO_METRICS.TURNS_TOTAL && metric.labels.status === 'completed',
	)
	assert.ok(completed)
})

function createBus() {
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
