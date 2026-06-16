import { isErrorEvent } from './isErrorEvent.js'

/**
 * Tracks per-turn phase timings from bus events and emits duration callbacks.
 */
export function createTurnMetricsCollector(options = {}) {
	const phases = options.phases || []
	const onPhaseDuration = options.onPhaseDuration || (() => {})
	const onRenderDuration = options.onRenderDuration || (() => {})
	const onTurnStatus = options.onTurnStatus || (() => {})

	/** @type {Map<string, TurnState>} */
	const turns = new Map()

	return {
		onTurnAbandoned(event) {
			turns.delete(event.turnId)
		},

		onTurnStart(event) {
			turns.set(event.turnId, {
				openPhases: new Map(),
				lastPhaseEndedAt: null,
				hasError: false,
			})
		},

		onTurnEnd(event, labels = {}) {
			const state = turns.get(event.turnId)
			if (state?.lastPhaseEndedAt != null) {
				const renderMs = Math.max(0, Date.now() - state.lastPhaseEndedAt)
				onRenderDuration(renderMs, { ...labels, phase: 'render' })
			}
			onTurnStatus(state?.hasError ? 'error' : 'completed', labels)
			turns.delete(event.turnId)
		},

		onBusEvent(event, labels = {}) {
			if (!event.turnId) return

			const state = turns.get(event.turnId)
			if (!state) return

			if (isErrorEvent(event) && !state.hasError) {
				state.hasError = true
			}

			for (const phase of phases) {
				if (event.name === phase.startEvent) {
					state.openPhases.set(phase.id, Date.now())
					continue
				}

				if (event.name === phase.endEvent) {
					const startedAt = state.openPhases.get(phase.id)
					if (startedAt != null) {
						const durationMs = Math.max(0, Date.now() - startedAt)
						onPhaseDuration(phase.id, durationMs, labels)
						state.openPhases.delete(phase.id)
						state.lastPhaseEndedAt = Date.now()
					}
				}
			}
		},

		getTurnState(turnId) {
			return turns.get(turnId) || null
		},

		clear() {
			turns.clear()
		},
	}
}

/**
 * @typedef {object} TurnState
 * @property {Map<string, number>} openPhases
 * @property {number | null} lastPhaseEndedAt
 * @property {boolean} hasError
 */
