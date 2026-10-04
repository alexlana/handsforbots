/**
 * Headless entry point: the bot runtime (backend, MCP, action policies, history,
 * observability) without the Hands for Bots chat UI. The host app renders the
 * conversation with its own components.
 *
 *   import { createHeadlessBot } from './handsforbots/Headless/index.js'
 *
 *   const h4b = createHeadlessBot({ engine: 'rasa', engine_endpoint: '...' })
 *   h4b.subscribe( ( state ) => render( state.messages ) )
 *   h4b.registerCommand( 'Cart.add', ( params ) => cart.add( params ) )
 *   h4b.send( 'Quero dois cafés' )
 */

import Bot from '../Bot.js'
import HeadlessBot from './HeadlessBot.js'

/**
 * @param  {Object}  options          - Same options as `new Bot()`, plus:
 * @param  {boolean} options.commands - Load the Bot's Commands output (default true)
 * @return {HeadlessBot}
 */
export function createHeadlessBot ( options = {} ) {

	const { commands = true, ...botOptions } = options

	botOptions.core = [ ...( botOptions.core || [] ) ]
	botOptions.plugins = [ ...( botOptions.plugins || [] ) ]

	if ( commands && ! botOptions.core.some( p => p.plugin === 'BotsCommands' ) ) {
		botOptions.core.push({ plugin: 'BotsCommands', type: 'output' })
	}

	return new HeadlessBot( new Bot( botOptions ) )

}

export { HeadlessBot }
export { loopDetector, actionKey } from '../Libs/ActionGuard.js'
