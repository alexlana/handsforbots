import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLangfuseExporter } from '../exporters/langfuse.js'
import { createLangsmithExporter } from '../exporters/langsmith.js'

test('Langfuse nests phase spans under turn root', async () => {
	const observations = []
	const startObservation = createMockLangfuseStart(observations)

	const exporter = createLangfuseExporter({ startObservation })
	await exporter.init({ identity: { slug: 'test' } })

	const turnId = 'turn-1'
	exporter.onEvent({
		type: 'turn.start',
		name: 'user.message',
		turnId,
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})
	exporter.onEvent({
		type: 'phase.start',
		phase: 'backend',
		source: 'bus',
		turnId,
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})
	exporter.onEvent({
		type: 'phase.end',
		phase: 'backend',
		durationMs: 120,
		source: 'bus',
		turnId,
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})
	exporter.onEvent({
		type: 'turn.end',
		name: 'bot.response',
		durationMs: 200,
		turnId,
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})

	const turn = observations.find((item) => item.name === 'turn:user.message')
	const phase = observations.find((item) => item.name === 'phase:backend')

	assert.ok(turn)
	assert.ok(phase)
	assert.equal(phase.parent, turn)
	assert.equal(phase.ended, true)
	assert.equal(phase.output?.durationMs, 120)
	assert.equal(turn.ended, true)
})

test('LangSmith nests phase runs under turn root', async () => {
	const runs = []
	const RunTree = createMockRunTree(runs)

	const exporter = createLangsmithExporter({ RunTree, projectName: 'test-app' })
	await exporter.init({ identity: { slug: 'test-app' } })

	const turnId = 'turn-1'
	exporter.onEvent({
		type: 'turn.start',
		name: 'user.message',
		turnId,
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})
	exporter.onEvent({
		type: 'phase.start',
		phase: 'backend',
		source: 'bus',
		turnId,
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})
	exporter.onEvent({
		type: 'phase.end',
		phase: 'backend',
		durationMs: 80,
		source: 'manual',
		turnId,
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})

	const turn = runs.find((item) => item.name === 'turn:user.message')
	const phase = runs.find((item) => item.name === 'phase:backend')

	assert.ok(turn)
	assert.ok(phase)
	assert.equal(phase.parent_run, turn)
	assert.equal(phase.run_type, 'chain')
	assert.equal(phase.outputs?.durationMs, 80)
	assert.equal(phase.ended, true)
})

test('Langfuse onPhaseEnd closes open phase observations', async () => {
	const observations = []
	const startObservation = createMockLangfuseStart(observations)
	const exporter = createLangfuseExporter({ startObservation })
	await exporter.init({ identity: { slug: 'test' } })

	const turnId = 'turn-2'
	exporter.onEvent({
		type: 'turn.start',
		name: 'user.message',
		turnId,
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})
	exporter.onEvent({
		type: 'phase.start',
		phase: 'fetch',
		source: 'manual',
		turnId,
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})

	exporter.onPhaseEnd({
		type: 'phase.end',
		phase: 'fetch',
		durationMs: 15,
		source: 'manual',
		turnId,
		sessionId: 's1',
		traceId: 'tr1',
		environment: 'test',
	})

	const phase = observations.find((item) => item.name === 'phase:fetch')
	assert.equal(phase?.ended, true)
	assert.equal(phase?.output?.durationMs, 15)
})

function createMockLangfuseStart(observations) {
	return function mockStartObservation(name, body, options = {}) {
		const observation = createMockLangfuseObservation(name, body, options, observations)
		observations.push(observation)
		return observation
	}
}

function createMockLangfuseObservation(name, body, options = {}, observations = []) {
	const observation = {
		name,
		body,
		asType: options.asType,
		children: [],
		parent: null,
		ended: false,
		output: null,
		startObservation(childName, childBody, childOptions = {}) {
			const child = createMockLangfuseObservation(childName, childBody, childOptions, observations)
			child.parent = observation
			observation.children.push(child)
			observations.push(child)
			return child
		},
		update(payload = {}) {
			if (payload.output) observation.output = payload.output
			return observation
		},
		end() {
			observation.ended = true
		},
	}

	return observation
}

function createMockRunTree(runs) {
	return function MockRunTree(config = {}) {
		const run = {
			name: config.name,
			run_type: config.run_type,
			parent_run: config.parent_run || null,
			inputs: config.inputs,
			outputs: null,
			ended: false,
			postRun() {},
			end(payload = {}) {
				if (payload.outputs) run.outputs = payload.outputs
				run.ended = true
			},
		}
		runs.push(run)
		return run
	}
}
