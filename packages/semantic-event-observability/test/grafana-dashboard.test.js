import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const REQUIRED_METRICS = [
	'sevo_turn_duration_ms',
	'sevo_phase_duration_ms',
	'sevo_phase_wait_ms',
	'sevo_events_dropped_total',
	'sevo_state_gauge',
	'sevo_turns_total',
	'sevo_bus_events_total',
]

const REQUIRED_PROMQL = [
	/sevo_turn_duration_ms_bucket/,
	/sevo_phase_duration_ms_bucket.*by \(le, phase\)/,
	/sevo_phase_wait_ms_bucket.*by \(le, phase\)/,
	/sevo_state_gauge\{key=\\"queueDepth\\"\}/,
	/by \(status\)/,
	/by \(reason\)/,
	/by \(event\)/,
]

for (const file of [
	'grafana/semantic-event-observability.json',
	'grafana/semantic-event-observability.lgtm.json',
]) {
	test(`${file} includes core sevo_* PromQL panels`, () => {
		const raw = readFileSync(join(root, file), 'utf8')
		for (const metric of REQUIRED_METRICS) {
			assert.match(
				raw,
				new RegExp(metric.replace(/\./g, '\\.')),
				`missing ${metric} in ${file}`,
			)
		}
		for (const pattern of REQUIRED_PROMQL) {
			assert.match(raw, pattern, `missing PromQL ${pattern} in ${file}`)
		}
		assert.doesNotMatch(
			raw,
			/_milliseconds_bucket/,
			`avoid OTel double-suffix *_milliseconds_bucket in ${file}`,
		)
	})
}
