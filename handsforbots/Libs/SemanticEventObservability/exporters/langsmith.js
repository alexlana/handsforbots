import { resolveOptionalDependency } from '../utils/probeOptional.js'

/**
 * LangSmith exporter (optional dependency).
 * Uses RunTree API when langsmith package is present or injected.
 */
export function createLangsmithExporter(config = {}) {
	const id = 'langsmith'
	let RunTree = null
	let activeRuns = new Map()
	let exporterConfig = {}

	return {
		id,
		available: false,
		description: 'LangSmith runs for LLM workflow debugging',

		async init(context) {
			exporterConfig = config
			const resolved = await resolveOptionalDependency(config.client, {
				moduleSpecifier: 'langsmith',
			})

			RunTree = resolved?.module?.RunTree || config.RunTree
			if (typeof RunTree !== 'function') return

			this.available = true
			this.projectName = config.projectName || context.identity.slug
		},

		onEvent(event) {
			if (!RunTree) return

			if (event.type === 'turn.start') {
				const run = new RunTree({
					name: `turn:${event.name || 'conversation'}`,
					run_type: 'chain',
					project_name: this.projectName,
					inputs: { event: event.name },
					extra: baseExtra(event, exporterConfig),
				})
				run.postRun()
				activeRuns.set(event.turnId, run)
				return
			}

			if (event.type === 'turn.end') {
				const run = activeRuns.get(event.turnId)
				if (run) {
					run.end({
						outputs: { durationMs: event.durationMs },
					})
				}
				activeRuns.delete(event.turnId)
				return
			}

			const parent = event.turnId ? activeRuns.get(event.turnId) : null
			const child = new RunTree({
				name: `event:${event.name}`,
				run_type: 'tool',
				project_name: this.projectName,
				inputs: { preview: event.payloadSummary?.preview },
				parent_run: parent || undefined,
				extra: baseExtra(event, exporterConfig),
			})
			child.postRun()
			child.end()
		},

		onMetric(metric) {
			if (!RunTree) return
			const run = new RunTree({
				name: `metric:${metric.name}`,
				run_type: 'tool',
				project_name: this.projectName,
				inputs: { value: metric.value, labels: metric.labels || {} },
			})
			run.postRun()
			run.end()
		},

		destroy() {
			for (const run of activeRuns.values()) {
				try { run.end?.() } catch { /* noop */ }
			}
			activeRuns = new Map()
		},
	}
}

function baseExtra(event, config = {}) {
	return {
		metadata: {
			sessionId: event.sessionId,
			turnId: event.turnId,
			traceId: event.traceId,
			eventName: event.name,
			environment: event.environment,
			tags: config.tags || [],
		},
	}
}
