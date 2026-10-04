import { createHeadlessBot, HeadlessBot } from '../../Headless/index.js'
import { HANDS_FOR_BOTS_KEY } from './useHandsForBots.js'

/**
 * Vue plugin: creates (or receives) the headless bot and provides it to the app.
 *
 *   app.use( createHandsForBots({ engine: 'rasa', engine_endpoint: '...' }) )
 *
 * @param  {Object|HeadlessBot} options - `createHeadlessBot` options, or an existing instance
 * @return {Object} Vue plugin, with the instance at `.h4b`
 */
export function createHandsForBots ( options = {} ) {

	const h4b = options instanceof HeadlessBot ? options : createHeadlessBot( options )
	const owned = h4b !== options

	return {
		h4b: h4b,
		install ( app ) {
			app.provide( HANDS_FOR_BOTS_KEY, h4b )
			app.config.globalProperties.$h4b = h4b
			if ( owned && typeof app.onUnmount === 'function' ) {
				app.onUnmount( ()=> h4b.destroy() )
			}
		},
	}

}
