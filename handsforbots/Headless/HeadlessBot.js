/**
 * HeadlessBot — lets a host app (Vue, React, vanilla) drive Hands for Bots with
 * its own UI. It turns the bot events into a small store:
 *
 *   const h4b = new HeadlessBot( bot )
 *   const stop = h4b.subscribe( ( state ) => render( state ) )
 *   h4b.send( 'Olá' )
 *
 * State (a new object on every change, safe for `useSyncExternalStore` or `shallowRef`):
 *
 *   {
 *     status:   'loading' | 'ready' | 'destroyed',
 *     thinking: boolean,            // waiting for the backend
 *     messages: Array<Message>,     // user and assistant messages, history included
 *   }
 *
 * Message: { id, role: 'user'|'assistant', text, html, buttons, images, type, source, raw }
 *
 * This module does not import Bot.js, so it runs anywhere; see `./index.js` for the factory.
 */

const RECEIVER = 'headless.receiver'

export default class HeadlessBot {

	/**
	 * @param {Object} bot - Bot instance
	 */
	constructor ( bot ) {

		this.bot = bot
		this.listeners = new Set()
		this.eventListeners = {}
		this.pending = []
		this.nextId = 1

		this.backendReady = !!bot.backend
		this.historyReady = !!bot.history_loaded

		this.state = {
			status: 'loading',
			thinking: !!bot.calling_backend,
			messages: this.historyToMessages( bot.history || [] ),
		}
		this.updateStatus()

		const on = ( name, fn )=>{
			bot.eventEmitter.on( name, ( ...args )=>{
				if ( this.state.status !== 'destroyed' ) fn( ...args )
			})
		}

		on( 'core.loaded', ()=>{
			this.backendReady = true
			this.updateStatus()
		})
		on( 'core.history_loaded', ()=>{
			this.historyReady = true
			this.setState({ messages: this.historyToMessages( bot.history || [] ) })
			this.updateStatus()
		})
		on( 'core.history_cleared', ()=>{
			this.setState({ messages: [] })
		})
		on( 'core.calling_backend', ()=>{
			this.setState({ thinking: true })
		})
		on( 'core.backend_responded', ()=>{
			this.setState({ thinking: false })
		})
		on( 'core.input', ( input )=>{
			this.appendUser( input.title || input.payload, input.plugin, input.payload )
		})
		on( 'core.output_ready', ( payload )=>{
			this.appendAssistant( payload )
		})
		on( 'core.other_window_input', ( payload )=>{
			this.appendUser( payload, 'other_window', payload )
		})
		on( 'core.other_window_output', ( payload )=>{
			this.appendAssistant( payload )
		})

		/**
		 * The backend answer to our `send()` comes back here.
		 */
		on( RECEIVER, ( response )=>{
			bot.eventEmitter.trigger( 'core.spread_output', [response] )
		})

	}

	/**
	 * Current state snapshot.
	 * @return {Object}
	 */
	getState () {

		return this.state

	}

	/**
	 * Listen to state changes.
	 * @param  {Function} listener - Receives the new state
	 * @return {Function} Unsubscribe
	 */
	subscribe ( listener ) {

		this.listeners.add( listener )
		return ()=>{ this.listeners.delete( listener ) }

	}

	/**
	 * Listen to a bot event (ex.: 'core.action_blocked'). Unlike `bot.eventEmitter.on`,
	 * each listener can be removed on its own.
	 * @param  {string}   name
	 * @param  {Function} fn
	 * @return {Function} Unsubscribe
	 */
	on ( name, fn ) {

		if ( ! this.eventListeners[ name ] ) {
			this.eventListeners[ name ] = new Set()
			this.bot.eventEmitter.on( name, ( ...args )=>{
				if ( this.state.status === 'destroyed' ) return
				for ( const listener of this.eventListeners[ name ] ) {
					listener( ...args )
				}
			})
		}
		this.eventListeners[ name ].add( fn )
		return ()=>{ this.eventListeners[ name ].delete( fn ) }

	}

	/**
	 * Send a user message to the backend. Messages sent before the bot is ready are queued.
	 * @param  {string} payload - What goes to the backend
	 * @param  {Object} options
	 * @param  {string} options.title - What the user sees, when different from the payload
	 *                                  (ex.: a button with payload "/buy{id:3}")
	 * @return {boolean} False when there is nothing to send
	 */
	send ( payload, options = {} ) {

		if ( this.state.status === 'destroyed' ) {
			throw new Error( 'HeadlessBot was destroyed.' )
		}
		if ( typeof payload !== 'string' || payload.trim().length === 0 ) {
			return false
		}

		const message = { payload: payload, title: options.title || payload }

		if ( this.state.status !== 'ready' ) {
			this.pending.push( message )
			return true
		}

		this.dispatch( message )
		return true

	}

	/**
	 * Register a function bot's commands can call (ex.: 'Cart.add').
	 * @return {Function} Unregister
	 */
	registerCommand ( name, fn ) {

		return this.bot.registerCommand( name, fn )

	}

	/**
	 * Register an action policy (see Libs/ActionGuard.js).
	 * @return {Function} Remove
	 */
	addActionPolicy ( policy ) {

		return this.bot.addActionPolicy( policy )

	}

	/**
	 * Clear the conversation history.
	 */
	clear () {

		this.bot.clearStorage()

	}

	/**
	 * Stop listening and release the bot resources.
	 */
	destroy () {

		if ( this.state.status === 'destroyed' ) return
		this.pending = []
		this.setState({ status: 'destroyed', thinking: false })
		this.listeners.clear()
		if ( typeof this.bot.destroy === 'function' ) {
			this.bot.destroy()
		}

	}

	// ----------------------------------------------------------------

	dispatch ( message ) {

		const emitter = this.bot.eventEmitter
		emitter.trigger( 'core.input', [{ 'plugin': 'Headless', 'payload': message.payload, 'title': message.title }] )
		emitter.trigger( 'core.send_to_backend', [{ 'plugin': 'Headless', 'payload': message.payload, 'trigger': RECEIVER }] )

	}

	updateStatus () {

		if ( this.state.status !== 'loading' || ! this.backendReady || ! this.historyReady ) {
			return
		}
		this.setState({ status: 'ready' })

		const pending = this.pending
		this.pending = []
		for ( const message of pending ) {
			this.dispatch( message )
		}

	}

	setState ( patch ) {

		this.state = { ...this.state, ...patch }
		for ( const listener of this.listeners ) {
			listener( this.state )
		}

	}

	appendUser ( text, source, raw ) {

		if ( typeof text !== 'string' ) return
		this.setState({ messages: [ ...this.state.messages, this.userMessage( text, source, raw ) ] })

	}

	appendAssistant ( payload ) {

		const messages = this.outputToMessages( payload )
		if ( messages.length === 0 ) return
		this.setState({ messages: [ ...this.state.messages, ...messages ] })

	}

	userMessage ( text, source, raw ) {

		return {
			id: 'm' + ( this.nextId++ ),
			role: 'user',
			text: text,
			html: null,
			buttons: [],
			images: [],
			type: 'text',
			source: source,
			raw: raw,
		}

	}

	outputToMessages ( payload ) {

		if ( ! Array.isArray( payload ) ) {
			payload = payload ? [ payload ] : []
		}

		const messages = []
		for ( const item of payload ) {
			if ( ! item || typeof item !== 'object' ) continue

			const images = item.images || ( item.image ? [ item.image ] : [] )
			const buttons = item.buttons || []
			const text = typeof item.text === 'string' ? item.text.trim() : ''

			if ( ! text && ! item.html && images.length === 0 && buttons.length === 0 ) {
				continue // ex.: a message that only carried a bot's command
			}

			messages.push({
				id: 'm' + ( this.nextId++ ),
				role: 'assistant',
				text: text,
				html: item.html || null,
				buttons: buttons,
				images: images,
				type: item.type || 'text',
				source: item.plugin_source || null,
				raw: item,
			})
		}
		return messages

	}

	/**
	 * History entries are `[type, plugin, payload, title]`; outputs are stored as JSON.
	 */
	historyToMessages ( history ) {

		const messages = []
		for ( const entry of history ) {
			const [ type, plugin, payload, title ] = entry
			if ( type === 'input' ) {
				const text = title || payload
				if ( typeof text === 'string' ) messages.push( this.userMessage( text, plugin, payload ) )
			} else if ( type === 'output' ) {
				let parsed = payload
				if ( typeof payload === 'string' ) {
					try { parsed = JSON.parse( payload ) } catch ( e ) { parsed = [{ text: payload }] }
				}
				messages.push( ...this.outputToMessages( parsed ) )
			}
		}
		return messages

	}

}
