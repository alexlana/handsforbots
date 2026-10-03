import { createId } from '../utils/id.js'
import TurnModel, { defineTurnModel } from './TurnModel.js'

/**
 * Tracks turn/session correlation for async event flows.
 */
export default class CorrelationContext {
	constructor(options = {}) {
		this.sessionId = options.sessionId || createId('session')
		this.turnModel = new TurnModel(
			options.turnModel || defineTurnModel({
				startEvents: options.turnStartEvents,
				endEvents: options.turnEndEvents,
			}),
		)
		this.turnMetadata = {}
	}

	startSession(sessionId = createId('session')) {
		this.sessionId = sessionId
		this.turnModel = new TurnModel({
			startEvents: [...this.turnModel.startEvents],
			endEvents: [...this.turnModel.endEvents],
		})
		this.turnMetadata = {}
	}

	observeBusEvent(eventName) {
		return this.turnModel.observeBusEvent(eventName)
	}

	getContext() {
		return {
			sessionId: this.sessionId,
			...this.turnModel.getContext(),
			turnMetadata: { ...this.turnMetadata },
		}
	}

	setTurnMetadata(metadata = {}) {
		this.turnMetadata = { ...this.turnMetadata, ...metadata }
	}

	getActiveTurnAge() {
		return this.turnModel.getActiveTurnAge()
	}
}

export { defineTurnModel }
