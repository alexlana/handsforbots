import { attachHandsForBotsObservability } from '../../../Libs/SemanticEventObservability/adapters/handsforbots.js'

/**
 * Output plugin — passive observability for the event bus.
 * No UI; configures Semantic Event Observability via plugin options.
 */
export default class Observability {

	constructor(bot, options = {}) {
		this.bot = bot
		this.options = options

		if (bot.observability) {
			this.observability = bot.observability
			return
		}

		this.observability = attachHandsForBotsObservability(bot, options)
		console.log('[✔︎] Observability output connected.')
	}

	/**
	 * Required output contract; this plugin does not render chat UI.
	 */
	output(payload) {}

	ui(options) {
		this.bot.eventEmitter.trigger('core.ui_loaded')
	}

	waiting() {}
}
