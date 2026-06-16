import { resolveOptionalDependency } from '../utils/probeOptional.js'
import {
	baseEventMetadata,
	createLlmExporterState,
	endLlmHandle,
} from './llmExporterState.js'

/**
 * Langfuse exporter (optional dependency).
 * Uses @langfuse/tracing startObservation when available,
 * or injected client from config.
 */
export function createLangfuseExporter(config = {}) {
	const id = 'langfuse'
	let startObservation = null
	const state = createLlmExporterState()
	let exporterConfig = {}

	return {
		id,
		available: false,
		description: 'Langfuse traces/events for LLM-centric observability',

		async init() {
			exporterConfig = config
			const resolved = await resolveOptionalDependency(config.tracing, {
				moduleSpecifier: '@langfuse/tracing',
			})

			startObservation = resolved?.module?.startObservation || config.startObservation
			if (typeof startObservation !== 'function') return

			this.available = true
		},

		onEvent(event) {
			if (!startObservation) return

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
			if (!startObservation) return
			startObservation(`metric:${metric.name}`, {
				input: { value: metric.value, labels: metric.labels || {} },
				metadata: { source: 'semantic-event-observability' },
			}, { asType: 'event' })
		},

		destroy() {
			state.clear()
		},
	}

	function handleTurnStart(event) {
		const observation = startObservation(`turn:${event.name || 'conversation'}`, {
			input: { event: event.name },
			metadata: baseEventMetadata(event, exporterConfig),
		}, { asType: 'span' })
		state.setTurn(event.turnId, observation)
	}

	function handleTurnEnd(event) {
		state.endAllPhases(event.turnId, (phase) => {
			endLlmHandle(phase, { output: { status: 'open_on_turn_end' } })
		})

		const observation = state.getTurn(event.turnId)
		endLlmHandle(observation, {
			output: { durationMs: event.durationMs },
		})
		state.deleteTurn(event.turnId)
	}

	function handleTurnAbandoned(event) {
		state.endAllPhases(event.turnId, (phase) => {
			endLlmHandle(phase, { output: { status: 'abandoned' } })
		})

		const observation = state.getTurn(event.turnId)
		endLlmHandle(observation, { output: { status: 'abandoned' } })
		state.deleteTurn(event.turnId)
	}

	function handlePhaseStart(event) {
		const turn = state.getTurn(event.turnId)
		if (!turn || !event.phase) return

		const metadata = baseEventMetadata(event, exporterConfig)
		const body = {
			input: { phase: event.phase, source: event.source },
			metadata,
		}

		let phaseObservation
		if (typeof turn.startObservation === 'function') {
			phaseObservation = turn.startObservation(`phase:${event.phase}`, body, { asType: 'span' })
		} else {
			phaseObservation = startObservation(`phase:${event.phase}`, {
				...body,
				metadata: { ...metadata, parentTurnId: event.turnId },
			}, { asType: 'span' })
		}

		state.setPhase(event.turnId, event.phase, phaseObservation)
	}

	function handlePhaseEnd(event) {
		const phaseObservation = state.getPhase(event.turnId, event.phase)
		if (!phaseObservation) return

		endLlmHandle(phaseObservation, {
			output: {
				durationMs: event.durationMs,
				source: event.source,
			},
		})
		state.deletePhase(event.turnId, event.phase)
	}

	function handleBusEvent(event) {
		if (event.type !== 'bus.trigger') return

		const turn = event.turnId ? state.getTurn(event.turnId) : null
		const metadata = baseEventMetadata(event, exporterConfig)
		const body = {
			input: { preview: event.payloadSummary?.preview },
			metadata,
		}

		if (turn && typeof turn.startObservation === 'function') {
			const child = turn.startObservation(`event:${event.name}`, body, { asType: 'event' })
			endLlmHandle(child)
			return
		}

		startObservation(`event:${event.name}`, body, { asType: 'event' })
	}
}
