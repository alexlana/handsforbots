import { attachHandsForBotsObservability } from '../../../Libs/SemanticEventObservability/adapters/handsforbots.js'

/**
 * Output plugin — passive observability for the event bus.
 * No UI; configures Semantic Event Observability via plugin options.
 */
export default class Observability {

	constructor(bot, options = {}) {
		this.bot = bot
		this.options = options
		this.observability = bot.observability || null

		if (bot.observability) {
			return
		}

		// Instrument after all UI plugins finish — avoids interfering with plugin ui() setup.
		this.bot.eventEmitter.on('core.all_ui_loaded', () => {
			if (this.bot.observability) {
				this.observability = this.bot.observability
				return
			}

			this.observability = attachHandsForBotsObservability(this.bot, this.options)
			console.log('[✔︎] Observability output connected.')
		})
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
