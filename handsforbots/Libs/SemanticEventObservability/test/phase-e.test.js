import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTurnRootSpan, normalizeTurnRootSpanConfig } from '../core/turnSpanNaming.js'
import { createTraceMapper } from '../core/TraceMapper.js'
import { createSessionTracker } from '../core/SessionTracker.js'
import { createTestObservability } from './testHarness.js'
import { SEVO_METRICS } from '../core/MetricsRegistry.js'

test('buildTurnRootSpan uses invoke_agent naming when configured', () => {
	const event = {
		name: 'core.input',
		sessionId: 's1',
		turnId: 't1',
		traceId: 'tr1',
		environment: 'test',
		turnMetadata: { input_plugin: 'Text' },
	}

	const span = buildTurnRootSpan(event, {
		mode: 'invoke_agent',
		providerName: 'handsforbots',
	})

	assert.equal(span.name, 'invoke_agent Text')
	assert.equal(span.attributes['gen_ai.operation.name'], 'invoke_agent')
	assert.equal(span.attributes['gen_ai.agent.name'], 'Text')
	assert.equal(span.attributes['gen_ai.provider.name'], 'handsforbots')
	assert.equal(span.attributes['sevo.turn_start_event'], 'core.input')
	assert.equal(span.kind, 'internal')
})

test('buildTurnRootSpan keeps semantic turn naming by default', () => {
	const event = {
		name: 'user.message',
		sessionId: 's1',
		turnId: 't1',
		traceId: 'tr1',
		environment: 'test',
	}

	const span = buildTurnRootSpan(event)
	assert.equal(span.name, 'turn:user.message')
	assert.equal(span.attributes['gen_ai.operation.name'], undefined)
})

test('normalizeTurnRootSpanConfig accepts invoke_agent shorthand', () => {
	assert.equal(normalizeTurnRootSpanConfig('invoke_agent').mode, 'invoke_agent')
	assert.equal(normalizeTurnRootSpanConfig(true).mode, 'invoke_agent')
})

test('TraceMapper uses invoke_agent root span when configured', () => {
	const spans = []
	const backend = {
		startSpan(name, attributes, parent, options = {}) {
			const span = { name, attributes, parent, options, ended: false }
			spans.push(span)
			return span
		},
		endSpan(spanRef) {
			if (spanRef) spanRef.ended = true
		},
		setAttribute() {},
		setError() {},
	}

	const mapper = createTraceMapper({
		backend,
		turnRootSpan: { mode: 'invoke_agent', providerName: 'test-app' },
	})

	mapper.handleEvent({
		type: 'turn.start',
		name: 'user.message',
		turnId: 't1',
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})
	mapper.handleEvent({
		type: 'turn.end',
		name: 'bot.response',
		durationMs: 50,
		turnId: 't1',
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})

	assert.equal(spans.length, 1)
	assert.equal(spans[0].name, 'invoke_agent')
	assert.equal(spans[0].attributes['gen_ai.operation.name'], 'invoke_agent')
	assert.equal(spans[0].options.kind, 'internal')
	assert.ok(spans[0].ended)
})

test('session end rolls up sevo_session_turns_total and starts new session', async () => {
	const { observability, bus, init } = createTestObservability({
		observability: {
			turnStartEvents: ['user.message'],
			turnEndEvents: ['bot.response'],
			sessionEndEvents: ['session.renew'],
			exporters: [],
		},
	})

	await init()

	const firstSessionId = observability.correlation.sessionId

	bus.trigger('user.message', [{ text: 'one' }])
	bus.trigger('bot.response', [{ text: 'done' }])
	bus.trigger('user.message', [{ text: 'two' }])
	bus.trigger('bot.response', [{ text: 'done' }])
	bus.trigger('session.renew', [])

	assert.notEqual(observability.correlation.sessionId, firstSessionId)

	const sessionMetrics = observability.getMetrics().filter(
		(metric) => metric.name === SEVO_METRICS.SESSION_TURNS_TOTAL,
	)
	const completed = sessionMetrics.find((metric) => metric.labels.status === 'completed')
	assert.equal(completed?.value, 2)

	const timeline = observability.getTimeline()
	assert.ok(timeline.some((event) => event.type === 'session.end' && event.name === 'session.renew'))
})

test('endSession API rolls up session metrics manually', async () => {
	const { observability, bus, init } = createTestObservability({
		observability: {
			turnStartEvents: ['user.message'],
			turnEndEvents: ['bot.response'],
			exporters: [],
		},
	})

	await init()
	bus.trigger('user.message', [])
	bus.trigger('bot.response', [])

	const counts = observability.endSession('manual')
	assert.equal(counts.completed, 1)

	const rollup = observability.getMetrics().find(
		(metric) => metric.name === SEVO_METRICS.SESSION_TURNS_TOTAL,
	)
	assert.equal(rollup?.value, 1)
})

test('createSessionTracker counts completed and abandoned turns', () => {
	const tracker = createSessionTracker()
	tracker.recordTurn('completed')
	tracker.recordTurn('completed')
	tracker.recordTurn('abandoned')
	assert.deepEqual(tracker.getCounts(), { completed: 2, abandoned: 1 })
	tracker.reset()
	assert.deepEqual(tracker.getCounts(), { completed: 0, abandoned: 0 })
})
