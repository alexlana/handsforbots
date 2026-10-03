import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createObservability } from '../core/createObservability.js'

test('onPhaseEnd exporter hook receives phase.end events', async () => {
	const phaseEnds = []
	const observability = createObservability({
		environment: 'test',
		turnStartEvents: ['user.message'],
		turnEndEvents: ['bot.response'],
		phases: [],
		exporters: [],
	})

	const bus = createBus()
	observability.instrument(bus)
	await observability.init()

	observability.exporters.push({
		id: 'hook-test',
		available: true,
		onPhaseEnd(event) {
			phaseEnds.push(event.phase)
		},
	})

	bus.trigger('user.message', [])
	observability.startPhase('work')
	observability.endPhase('work')

	assert.ok(phaseEnds.includes('work'))
})

function createBus() {
	const listeners = new Map()
	return {
		on(name, callback) {
			if (!listeners.has(name)) listeners.set(name, [])
			listeners.get(name).push(callback)
		},
		trigger(name, args) {
			for (const callback of listeners.get(name) || []) {
				callback(...(Array.isArray(args) ? args : [args]))
			}
		},
	}
}
