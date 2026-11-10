import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeBaggage, mergeBaggage, parseBaggage } from '../core/baggage.js'
import { createOtelExporter } from '../exporters/otel.js'
import { createTestObservability } from './testHarness.js'

test('encodeBaggage / parseBaggage round-trip with percent-encoding', () => {
	const header = encodeBaggage({ 'greeting.kind': 'directed', 'greeting.index': 3, ok: true, skip: null, 'bad key': 'x' })
	assert.equal(header, 'greeting.kind=directed,greeting.index=3,ok=true')
	assert.equal(encodeBaggage({ a: 'x,y=z' }), 'a=x%2Cy%3Dz')
	assert.deepEqual(parseBaggage('a=x%2Cy%3Dz, b = 2;prop=1, broken, =x, c=%E0%A4%A'), { a: 'x,y=z', b: '2' })
	assert.deepEqual(parseBaggage({ Baggage: 'k=v' }), { k: 'v' })
	assert.deepEqual(parseBaggage(new Headers({ baggage: 'k=v' })), { k: 'v' })
	assert.deepEqual(parseBaggage(undefined), {})
	assert.deepEqual(parseBaggage('k=' + 'x'.repeat(9000)), {})
})

test('mergeBaggage keeps other members and lets the attributes win', () => {
	assert.equal(mergeBaggage('other=1,greeting.kind=open;p=1', { 'greeting.kind': 'directed' }), 'other=1,greeting.kind=directed')
	assert.equal(mergeBaggage('', { a: 1 }), 'a=1')
	assert.equal(mergeBaggage('a=1', {}), 'a=1')
})

test('setAttributes: on every event and in getTraceHeaders as baggage', async () => {
	const { observability, bus, init } = createTestObservability({
		observability: { turnStartEvents: ['user.message'], turnEndEvents: ['bot.response'], exporters: [] },
	})
	await init()
	assert.equal(observability.getTraceHeaders().baggage, undefined)

	observability.setAttributes({ 'greeting.kind': 'directed', 'greeting.index': 3, dropped: {} })
	assert.deepEqual(observability.getAttributes(), { 'greeting.kind': 'directed', 'greeting.index': 3 })
	bus.trigger('user.message', [{}])
	bus.trigger('bot.response', [{}])
	const events = observability.getTimeline()
	assert.ok(events.length > 0)
	for (const event of events) assert.deepEqual(event.attributes, { 'greeting.kind': 'directed', 'greeting.index': 3 })

	const headers = observability.getTraceHeaders()
	assert.equal(headers.baggage, 'greeting.kind=directed,greeting.index=3')

	// An injected carrier (OTel propagators) with its own baggage is merged.
	observability.traceContext.setHeaderInjector(() => ({ traceparent: '00-a-b-01', baggage: 'tenant=x' }))
	assert.deepEqual(observability.getTraceHeaders(), {
		traceparent: '00-a-b-01',
		baggage: 'tenant=x,greeting.kind=directed,greeting.index=3',
	})

	observability.setAttributes({})
	observability.traceContext.setHeaderInjector(null)
	assert.equal(observability.getTraceHeaders().baggage, undefined)
})

test('disabled observability sends no baggage and counts nothing', async () => {
	const { observability, init } = createTestObservability({ observability: { enabled: false, exporters: [] } })
	await init()
	observability.setAttributes({ a: 1 })
	assert.equal(observability.getTraceHeaders().baggage, undefined)
	observability.recordCounter('x_total')
	assert.equal(observability.getMetrics().length, 0)
})

test('recordCounter is never sampled and reaches a lazily created OTel counter with labels as given', async () => {
	const added = []
	const meter = {
		createCounter: (name) => ({ add: (value, attributes) => added.push({ name, value, attributes }) }),
		createHistogram: () => ({ record() {} }),
		createGauge: () => ({ record() {} }),
	}
	const exporter = createOtelExporter({ api: {}, getMeter: () => meter })
	const { observability, init } = createTestObservability({
		observability: { exporters: [], customExporters: [exporter], sampleRate: 0, maxEventsPerMinute: 0 },
	})
	await init()
	observability.recordCounter('h4b_experiment_exposed_total', 1, { experiment: 'greeting', 'greeting.index': 3 })
	observability.recordCounter('h4b_experiment_exposed_total', 1, { experiment: 'greeting', 'greeting.index': 4 })

	const metric = observability.getMetrics().find((m) => m.name === 'h4b_experiment_exposed_total')
	assert.equal(metric.type, 'counter')
	assert.deepEqual(added, [
		{ name: 'h4b_experiment_exposed_total', value: 1, attributes: { environment: 'test', experiment: 'greeting', 'greeting.index': 3 } },
		{ name: 'h4b_experiment_exposed_total', value: 1, attributes: { environment: 'test', experiment: 'greeting', 'greeting.index': 4 } },
	])
})

test('TraceMapper puts the attributes on turn and event spans', async () => {
	const spans = []
	const span = (name, attributes) => ({ name, attributes, end() {}, setAttribute() {}, setStatus() {} })
	const exporter = createOtelExporter({
		api: {},
		getTracer: () => ({ startSpan: (name, options) => { const s = span(name, options.attributes); spans.push(s); return s } }),
		traceApi: { context: { active: () => ({}) }, trace: { setSpan: (ctx) => ctx } },
	})
	const { observability, bus, init } = createTestObservability({
		observability: { turnStartEvents: ['user.message'], turnEndEvents: ['bot.response'], exporters: [], customExporters: [exporter] },
	})
	await init()
	observability.setAttributes({ 'greeting.kind': 'open' })
	bus.trigger('user.message', [{}])
	bus.trigger('tool.call', [{}])
	bus.trigger('bot.response', [{}])
	assert.ok(spans.length >= 2)
	for (const s of spans) assert.equal(s.attributes['greeting.kind'], 'open', s.name)
})
