import { test } from 'node:test'
import assert from 'node:assert/strict'
import TurnModel, { defineTurnModel } from '../core/TurnModel.js'
import { createTraceContextBridge } from '../core/TraceContextBridge.js'
import { createEventInstrumentation } from '../core/eventInstrumentation.js'
import { instrumentChannel } from '../adapters/instrumentChannel.js'
import { createObservability } from '../core/createObservability.js'
import { SEVO_METRICS } from '../core/MetricsRegistry.js'

test('TurnModel detects start, end, and abandonment', () => {
	const model = new TurnModel(defineTurnModel({
		startEvents: ['user.message'],
		endEvents: ['bot.response'],
	}))

	const first = model.observeBusEvent('user.message')
	assert.equal(first.type, 'turn.start')
	assert.ok(first.turnId)

	const abandoned = model.observeBusEvent('user.message')
	assert.ok(abandoned.abandoned)
	assert.equal(abandoned.started.type, 'turn.start')
	assert.notEqual(abandoned.abandoned.turnId, abandoned.started.turnId)

	const ended = model.observeBusEvent('bot.response')
	assert.equal(ended.type, 'turn.end')
	assert.ok(ended.durationMs >= 0)
	assert.equal(model.getContext().turnId, null)
})

test('TraceContextBridge injects trace headers', () => {
	const bridge = createTraceContextBridge({
		getContext: () => ({ traceId: 'trace-123' }),
	})

	assert.equal(bridge.getTraceHeaders()['sevo-trace-id'], 'trace-123')

	bridge.setHeaderInjector(() => ({ traceparent: '00-abc' }))
	assert.equal(bridge.getTraceHeaders().traceparent, '00-abc')

	const init = bridge.withTraceContext('https://example.com', {
		headers: { 'x-custom': '1' },
	})
	assert.equal(init.headers['sevo-trace-id'], 'trace-123')
	assert.equal(init.headers['x-custom'], '1')
})

test('eventFilter and eventAllowlist gate bus event recording', async () => {
	const bus = createBus()
	const observability = createObservability({
		environment: 'test',
		turnStartEvents: ['user.message'],
		turnEndEvents: ['bot.response'],
		eventAllowlist: ['user.message', 'bot.response'],
		exporters: [],
	})

	observability.instrument(bus)
	await observability.init()

	bus.trigger('user.message', [{ text: 'hi' }])
	bus.trigger('ignored.event', [{ foo: 'bar' }])
	bus.trigger('bot.response', [{ text: 'hello' }])

	const timeline = observability.getTimeline()
	assert.ok(timeline.some((event) => event.name === 'user.message'))
	assert.ok(timeline.some((event) => event.name === 'bot.response'))
	assert.ok(!timeline.some((event) => event.name === 'ignored.event'))
})

test('instrumentChannel records postMessage events', async () => {
	const observability = createObservability({
		environment: 'test',
		exporters: [],
	})
	await observability.init()

	const channel = {
		postMessage(data) {
			this.last = data
		},
	}

	instrumentChannel(observability, channel, { eventName: 'broadcast.post' })
	channel.postMessage({ hello: 'world' })

	const timeline = observability.getTimeline()
	assert.ok(timeline.some((event) => event.name === 'broadcast.post'))
})

test('createObservability exposes withTraceContext and active turns gauge', async () => {
	const bus = createBus()
	const observability = createObservability({
		environment: 'test',
		turnStartEvents: ['user.message'],
		turnEndEvents: ['bot.response'],
		exporters: [],
	})

	observability.instrument(bus)
	await observability.init()

	bus.trigger('user.message', [{ text: 'hi' }])

	const headers = observability.getTraceHeaders()
	assert.ok(headers['sevo-trace-id'])

	const active = observability.getMetrics().find(
		(metric) => metric.name === SEVO_METRICS.ACTIVE_TURNS,
	)
	assert.equal(active?.value, 1)

	bus.trigger('bot.response', [{ text: 'hello' }])

	const idle = observability.getMetrics()
		.filter((metric) => metric.name === SEVO_METRICS.ACTIVE_TURNS)
		.at(-1)
	assert.equal(idle?.value, 0)
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
