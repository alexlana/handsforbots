/**
 * Shared turn/phase tracking for Langfuse and LangSmith exporters.
 */
export function createLlmExporterState() {
	/** @type {Map<string, unknown>} */
	const turns = new Map()
	/** @type {Map<string, unknown>} */
	const phases = new Map()

	return {
		setTurn(turnId, handle) {
			if (turnId) turns.set(turnId, handle)
		},

		getTurn(turnId) {
			return turnId ? turns.get(turnId) : undefined
		},

		deleteTurn(turnId) {
			if (!turnId) return
			turns.delete(turnId)
			for (const key of [...phases.keys()]) {
				if (key.startsWith(`${turnId}:`)) phases.delete(key)
			}
		},

		setPhase(turnId, phaseId, handle) {
			if (turnId && phaseId) phases.set(phaseKey(turnId, phaseId), handle)
		},

		getPhase(turnId, phaseId) {
			if (!turnId || !phaseId) return undefined
			return phases.get(phaseKey(turnId, phaseId))
		},

		deletePhase(turnId, phaseId) {
			if (turnId && phaseId) phases.delete(phaseKey(turnId, phaseId))
		},

		endAllPhases(turnId, endFn) {
			if (!turnId) return
			for (const [key, handle] of phases.entries()) {
				if (!key.startsWith(`${turnId}:`)) continue
				try { endFn?.(handle) } catch { /* noop */ }
				phases.delete(key)
			}
		},

		clear() {
			turns.clear()
			phases.clear()
		},
	}
}

export function baseEventMetadata(event, config = {}) {
	return {
		sessionId: event.sessionId,
		turnId: event.turnId,
		traceId: event.traceId,
		eventName: event.name,
		environment: event.environment,
		project: config.project,
		phase: event.phase,
		phaseSource: event.source,
	}
}

function phaseKey(turnId, phaseId) {
	return `${turnId}:${phaseId}`
}

/**
 * End an observation/run handle if supported.
 */
export function endLlmHandle(handle, payload = {}) {
	if (!handle) return
	if (payload.output) handle.update?.({ output: payload.output })
	if (payload.outputs) {
		handle.end?.(payload)
	} else {
		handle.end?.()
	}
}
