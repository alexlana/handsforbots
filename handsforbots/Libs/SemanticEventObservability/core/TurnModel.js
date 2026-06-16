import { createId } from '../utils/id.js'

/**
 * Normalize turn boundary configuration.
 */
export function defineTurnModel(model = {}) {
	const start = model.startEvents || model.start || []
	const end = model.endEvents || model.end || []
	return {
		startEvents: [...new Set(start.map(String))],
		endEvents: [...new Set(end.map(String))],
	}
}

/**
 * Turn boundary detection with abandonment support.
 */
export default class TurnModel {
	constructor(model = {}) {
		const normalized = defineTurnModel(model)
		this.startEvents = new Set(normalized.startEvents)
		this.endEvents = new Set(normalized.endEvents)
		this.currentTurnId = null
		this.currentTraceId = null
		this.turnStartedAt = null
		this.completedTurns = 0
	}

	observeBusEvent(eventName) {
		if (this.startEvents.has(eventName)) {
			let abandoned = null
			if (this.currentTurnId) {
				abandoned = {
					type: 'turn.abandoned',
					turnId: this.currentTurnId,
					traceId: this.currentTraceId,
				}
			}

			this.currentTurnId = createId('turn')
			this.currentTraceId = createId('trace')
			this.turnStartedAt = Date.now()

			const started = {
				type: 'turn.start',
				turnId: this.currentTurnId,
				traceId: this.currentTraceId,
			}

			return abandoned ? { abandoned, started } : started
		}

		if (this.endEvents.has(eventName) && this.currentTurnId) {
			const turnId = this.currentTurnId
			const traceId = this.currentTraceId
			const durationMs = this.turnStartedAt ? Date.now() - this.turnStartedAt : null
			this.completedTurns += 1
			this.currentTurnId = null
			this.currentTraceId = null
			this.turnStartedAt = null
			return {
				type: 'turn.end',
				turnId,
				traceId,
				durationMs,
			}
		}

		return null
	}

	getContext() {
		return {
			turnId: this.currentTurnId,
			traceId: this.currentTraceId,
		}
	}

	getActiveTurnAge() {
		if (!this.turnStartedAt) return null
		return Math.max(0, Date.now() - this.turnStartedAt)
	}

	getCompletedTurns() {
		return this.completedTurns
	}
}
