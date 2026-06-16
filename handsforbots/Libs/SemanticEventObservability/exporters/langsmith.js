import { resolveOptionalDependency } from '../utils/probeOptional.js'
import {
	baseEventMetadata,
	createLlmExporterState,
	endLlmHandle,
} from './llmExporterState.js'

/**
 * LangSmith exporter (optional dependency).
 * Uses RunTree API when langsmith package is present or injected.
 */
export function createLangsmithExporter(config = {}) {
	const id = 'langsmith'
	let RunTree = null
	const state = createLlmExporterState()
	let exporterConfig = {}
	let projectName = 'semantic-event-observability'

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

			projectName = config.projectName || context.identity.slug
			this.available = true
			this.projectName = projectName
		},

		onEvent(event) {
			if (!RunTree) return

			switch (event.type) {
				case 'turn.start':
					handleTurnStart(event)
					break
				case 'turn.end':
					handleTurnEnd(event)
					break
				case 'turn.abandoned':
					handleTurnAbandoned(event)
					break
				case 'phase.start':
					handlePhaseStart(event)
					break
				case 'phase.end':
					handlePhaseEnd(event)
					break
				default:
					handleBusEvent(event)
			}
		},

		onPhaseEnd(event) {
			handlePhaseEnd(event)
		},

		onMetric(metric) {
			if (!RunTree) return
			const run = new RunTree({
				name: `metric:${metric.name}`,
				run_type: 'tool',
				project_name: projectName,
				inputs: { value: metric.value, labels: metric.labels || {} },
			})
			run.postRun()
			run.end()
		},

		destroy() {
			state.clear()
		},
	}

	function handleTurnStart(event) {
		const run = new RunTree({
			name: `turn:${event.name || 'conversation'}`,
			run_type: 'chain',
			project_name: projectName,
			inputs: { event: event.name },
			extra: langsmithExtra(event, exporterConfig),
		})
		run.postRun()
		state.setTurn(event.turnId, run)
	}

	function handleTurnEnd(event) {
		state.endAllPhases(event.turnId, (phaseRun) => {
			endLlmHandle(phaseRun, { outputs: { status: 'open_on_turn_end' } })
		})

		const run = state.getTurn(event.turnId)
		endLlmHandle(run, { outputs: { durationMs: event.durationMs } })
		state.deleteTurn(event.turnId)
	}

	function handleTurnAbandoned(event) {
		state.endAllPhases(event.turnId, (phaseRun) => {
			endLlmHandle(phaseRun, { outputs: { status: 'abandoned' } })
		})

		const run = state.getTurn(event.turnId)
		endLlmHandle(run, { outputs: { status: 'abandoned' } })
		state.deleteTurn(event.turnId)
	}

	function handlePhaseStart(event) {
		const parent = state.getTurn(event.turnId)
		if (!parent || !event.phase) return

		const phaseRun = new RunTree({
			name: `phase:${event.phase}`,
			run_type: 'chain',
			project_name: projectName,
			inputs: { phase: event.phase, source: event.source },
			parent_run: parent,
			extra: langsmithExtra(event, exporterConfig),
		})
		phaseRun.postRun()
		state.setPhase(event.turnId, event.phase, phaseRun)
	}

	function handlePhaseEnd(event) {
		const phaseRun = state.getPhase(event.turnId, event.phase)
		if (!phaseRun) return

		endLlmHandle(phaseRun, {
			outputs: {
				durationMs: event.durationMs,
				source: event.source,
			},
		})
		state.deletePhase(event.turnId, event.phase)
	}

	function handleBusEvent(event) {
		if (event.type !== 'bus.trigger') return

		const parent = event.turnId ? state.getTurn(event.turnId) : null
		const child = new RunTree({
			name: `event:${event.name}`,
			run_type: 'tool',
			project_name: projectName,
			inputs: { preview: event.payloadSummary?.preview },
			parent_run: parent || undefined,
			extra: langsmithExtra(event, exporterConfig),
		})
		child.postRun()
		child.end()
	}
}

function langsmithExtra(event, config = {}) {
	return {
		metadata: {
			...baseEventMetadata(event, config),
			tags: config.tags || [],
		},
	}
}
