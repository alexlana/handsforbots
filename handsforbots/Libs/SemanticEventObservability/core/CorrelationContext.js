import { createId } from '../utils/id.js'

/**
 * Tracks turn/session correlation for async event flows.
 */
export default class CorrelationContext {
	constructor(options = {}) {
		this.sessionId = options.sessionId || createId('session')
		this.turnStartEvents = new Set(options.turnStartEvents || [])
		this.turnEndEvents = new Set(options.turnEndEvents || [])
		this.currentTurnId = null
		this.currentTraceId = null
		this.turnStartedAt = null
		this.completedTurns = 0
	}

	startSession(sessionId = createId('session')) {
		this.sessionId = sessionId
		this.currentTurnId = null
		this.currentTraceId = null
		this.turnStartedAt = null
	}

	observeBusEvent(eventName) {
		if (this.turnStartEvents.has(eventName)) {
			this.currentTurnId = createId('turn')
			this.currentTraceId = createId('trace')
			this.turnStartedAt = Date.now()
			return {
				type: 'turn.start',
				turnId: this.currentTurnId,
				traceId: this.currentTraceId,
			}
		}

		if (this.turnEndEvents.has(eventName) && this.currentTurnId) {
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
			sessionId: this.sessionId,
			turnId: this.currentTurnId,
			traceId: this.currentTraceId,
		}
	}
}
