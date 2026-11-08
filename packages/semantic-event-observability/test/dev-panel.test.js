import assert from 'node:assert/strict'
import test from 'node:test'
import { clientEnvironment } from '../exporters/devPanel.js'

test('the export names the browser it came from', () => {
	const env = clientEnvironment()
	assert.equal(env.userAgent, globalThis.navigator?.userAgent)
	assert.ok('language' in env && 'platform' in env && 'viewport' in env)
})
