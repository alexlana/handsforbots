import { isErrorEvent } from './isErrorEvent.js'

/**
 * Tracks phases within a turn from bus events and manual start/end calls.
 */
export function createPhaseTracker(options = {}) {
	const phases = options.phases || []
	const isError = options.isError || isErrorEvent
	const onPhaseStart = options.onPhaseStart || (() => {})
	const onPhaseEnd = options.onPhaseEnd || (() => {})
	const onPhaseWait = options.onPhaseWait || (() => {})
	const onRenderDuration = options.onRenderDuration || (() => {})
	const onTurnStatus = options.onTurnStatus || (() => {})

	const phaseByStartEvent = new Map(phases.map((phase) => [phase.startEvent, phase]))
	const phaseByEndEvent = new Map(phases.map((phase) => [phase.endEvent, phase]))

	/** @type {Map<string, TurnPhaseState>} */
	const turns = new Map()

	return {
		onTurnAbandoned(event) {
			turns.delete(event.turnId)
		},

		onTurnStart(event) {
			turns.set(event.turnId, {
				turnStartedAt: Date.now(),
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

			markErrorIfNeeded(state, event)

			const startPhase = phaseByStartEvent.get(event.name)
			if (startPhase) {
				beginPhase(state, event.turnId, startPhase.id, labels, 'bus')
				return
			}

			const endPhase = phaseByEndEvent.get(event.name)
			if (endPhase) {
				finishPhase(state, event.turnId, endPhase.id, labels, 'bus')
			}
		},

		startPhase(turnId, phaseId, labels = {}) {
			if (!turnId || !phaseId) return false
			const state = turns.get(turnId)
			if (!state) return false
			beginPhase(state, turnId, String(phaseId), labels, 'manual')
			return true
		},

		endPhase(turnId, phaseId, labels = {}) {
			if (!turnId || !phaseId) return false
			const state = turns.get(turnId)
			if (!state) return false
			return finishPhase(state, turnId, String(phaseId), labels, 'manual')
		},

		getTurnState(turnId) {
			return turns.get(turnId) || null
		},

		clear() {
			turns.clear()
		},
	}

	function beginPhase(state, turnId, phaseId, labels, source) {
		if (state.openPhases.has(phaseId)) return

		if (state.turnStartedAt != null) {
			const waitMs = Math.max(0, Date.now() - state.turnStartedAt)
			onPhaseWait({
				turnId,
				phase: phaseId,
				waitMs,
				source,
				labels,
			})
		}

		state.openPhases.set(phaseId, { startedAt: Date.now(), source })
		onPhaseStart({
			turnId,
			phase: phaseId,
			source,
			labels,
		})
	}

	function finishPhase(state, turnId, phaseId, labels, source) {
		const open = state.openPhases.get(phaseId)
		if (!open) return false

		const durationMs = Math.max(0, Date.now() - open.startedAt)
		state.openPhases.delete(phaseId)
		state.lastPhaseEndedAt = Date.now()

		onPhaseEnd({
			turnId,
			phase: phaseId,
			durationMs,
			source: open.source || source,
			labels,
		})
		return true
	}

	function markErrorIfNeeded(state, event) {
		if (isError(event) && !state.hasError) {
			state.hasError = true
		}
	}
}

/**
 * @typedef {object} TurnPhaseState
 * @property {number} turnStartedAt
 * @property {Map<string, { startedAt: number, source: string }>} openPhases
 * @property {number | null} lastPhaseEndedAt
 * @property {boolean} hasError
 */
