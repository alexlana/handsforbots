import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestObservability } from './testHarness.js'

test('registerExporter attaches and initializes custom exporter', async () => {
	const events = []
	const { observability, bus } = createTestObservability({
		observability: {
			turnStartEvents: ['user.message'],
			turnEndEvents: ['bot.response'],
			exporters: [],
		},
	})

	await observability.init()

	const status = await observability.registerExporter({
		id: 'capture',
		available: true,
		onEvent(event) {
			events.push(event.type)
		},
	})

	assert.equal(status.id, 'capture')
	assert.equal(status.available, true)

	bus.trigger('user.message', [{ text: 'hi' }])
	bus.trigger('bot.response', [{ text: 'hello' }])

	assert.ok(events.includes('turn.start'))
	assert.ok(events.includes('turn.end'))
})

test('createTestObservability bootstraps memory exporter', async () => {
	const { observability, bus, init } = createTestObservability({
		observability: {
			turnStartEvents: ['ping'],
			turnEndEvents: ['pong'],
		},
	})

	await init()
	bus.trigger('ping', [])
	bus.trigger('pong', [])

	assert.ok(observability.getTimeline().length > 0)
})
