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
	})
}
