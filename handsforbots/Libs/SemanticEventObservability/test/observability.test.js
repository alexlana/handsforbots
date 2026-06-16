import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createObservability } from '../core/createObservability.js'
import { createMetricsRegistry, SEVO_METRICS } from '../core/MetricsRegistry.js'
import { createPhaseTracker } from '../core/PhaseTracker.js'
import { createTraceMapper } from '../core/TraceMapper.js'
import { definePhaseModel } from '../core/definePhaseModel.js'
import CorrelationContext from '../core/CorrelationContext.js'

test('MetricsRegistry records canonical sevo_* metrics', () => {
	const records = []
	const registry = createMetricsRegistry({ environment: 'test' })
	registry.subscribe((metric) => records.push(metric))

	registry.recordTurnDuration(1200, { input_plugin: 'Text' })
	registry.recordPhaseDuration('backend', 800, {})
	registry.recordTurnStatus('completed', {})
	registry.recordEventDropped('sampled_out')

	assert.equal(records.length, 4)
	assert.equal(records[0].name, SEVO_METRICS.TURN_DURATION)
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

test('PhaseTracker records bus-driven and manual phases', () => {
	const phases = definePhaseModel([
		{ id: 'backend', startEvent: 'api.call', endEvent: 'api.done' },
	])
	const phaseEnds = []

	const tracker = createPhaseTracker({
		phases,
		onPhaseStart: (data) => phaseEnds.push({ stage: 'start', phase: data.phase }),
		onPhaseEnd: (data) => phaseEnds.push({ stage: 'end', phase: data.phase, ms: data.durationMs }),
		onRenderDuration: () => {},
		onTurnStatus: () => {},
	})

	tracker.onTurnStart({ turnId: 'turn-1' })
	tracker.onBusEvent({ turnId: 'turn-1', name: 'api.call' })
	tracker.onBusEvent({ turnId: 'turn-1', name: 'api.done' })
	assert.equal(phaseEnds.filter((item) => item.phase === 'backend').length, 2)

	tracker.startPhase('turn-1', 'custom', {})
	assert.ok(tracker.endPhase('turn-1', 'custom', {}))
	assert.ok(phaseEnds.some((item) => item.phase === 'custom' && item.stage === 'end'))
})

test('TraceMapper builds span tree from semantic events', () => {
	const spans = []

	const backend = {
		startSpan(name, attributes, parent) {
			const span = { name, attributes, parent, ended: false }
			spans.push(span)
			return span
		},
		endSpan(spanRef) {
			if (spanRef) spanRef.ended = true
		},
		setAttribute(spanRef, key, value) {
			if (spanRef?.attributes) spanRef.attributes[key] = value
		},
		setError() {},
	}

	const mapper = createTraceMapper({ backend })

	mapper.handleEvent({
		type: 'turn.start',
		name: 'user.message',
		turnId: 't1',
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})
	mapper.handleEvent({
		type: 'phase.start',
		phase: 'backend',
		source: 'bus',
		turnId: 't1',
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})
	mapper.handleEvent({
		type: 'phase.end',
		phase: 'backend',
		durationMs: 42,
		turnId: 't1',
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})
	mapper.handleEvent({
		type: 'turn.end',
		name: 'bot.response',
		durationMs: 100,
		turnId: 't1',
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})

	assert.equal(spans.length, 2)
	assert.equal(spans[0].name, 'turn:user.message')
	assert.equal(spans[1].name, 'phase:backend')
	assert.equal(spans[1].parent, spans[0])
	assert.ok(spans.every((span) => span.ended))
})

test('createObservability emits turn and phase metrics on instrumented bus', async () => {
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
	const timeline = observability.getTimeline()

	assert.ok(names.includes(SEVO_METRICS.TURN_DURATION))
	assert.ok(names.includes(SEVO_METRICS.PHASE_DURATION))
	assert.ok(timeline.some((event) => event.type === 'phase.start' && event.phase === 'backend'))
	assert.ok(timeline.some((event) => event.type === 'phase.end' && event.phase === 'backend'))

	const completed = metrics.find(
		(metric) => metric.name === SEVO_METRICS.TURNS_TOTAL && metric.labels.status === 'completed',
	)
	assert.ok(completed)
})

test('createObservability supports manual startPhase and endPhase', async () => {
	const observability = createObservability({
		environment: 'test',
		turnStartEvents: ['user.message'],
		turnEndEvents: ['bot.response'],
		exporters: [],
	})

	const bus = createBus()
	observability.instrument(bus)
	await observability.init()

	bus.trigger('user.message', [{ text: 'hi' }])
	assert.equal(observability.startPhase('fetch'), true)
	assert.equal(observability.endPhase('fetch'), true)

	const timeline = observability.getTimeline()
	assert.ok(timeline.some((event) => event.type === 'phase.start' && event.phase === 'fetch'))
	assert.ok(timeline.some((event) => event.type === 'phase.end' && event.phase === 'fetch'))
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
