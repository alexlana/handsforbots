/**
 * 
 * Now the bot can use the UI! It puts de conversation at the center of interactions.
 * 
 * Simple flow:
 *
 * Inputs: 				|   > input >   [•_•]   > output >	|  Outputs:
 * Text					|									|  Text
 * Voice				|									|  Voice
 * Gesture (TODO)		|									|  UI (TODO)
 * Trigger/Poke			|									|  Bot's Commands
 * 
 */



import WebStorage from './Libs/WebStorage.umd.min.js'
import EventEmitter from './Libs/EventEmitter.js'
import CryptoKeys from './Libs/CryptoKeys.js'
import MCPHelper from './Libs/MCPHelper.js'
import BotSessionAdapter from './Libs/BotSessionAdapter.js'
import BotOrchestrator from './Core/BotOrchestrator.js'


/**
 * Bot core.
 */
export default class Bot {

	/**
	 * Bot core constructor.
	 */
	constructor ( options ) {

		console.log( '[-_-] The bot is on the production line. [-_-]' )

		/**
		 * Commands delimiters.
		 */
		this.action_tag_open = '[•'
		this.action_tag_close = '•]'

		/**
		 * Global options.
		 */
		this.options = options
		if ( this.options.plugins == undefined ) {
			this.options.plugins = []
		}
		if ( this.options.core == undefined ) {
			this.options.core = []
		}

		/**
		 * Start bot using minimal configuration options.
		 */
		if ( this.options.quick_start ) {

			if ( this.options.quick_start == 'text' ) {

				this.quickStartText()

			} else if ( this.options.quick_start == 'voice' ) {

				this.quickStartVoice()

			} else if ( this.options.quick_start == 'text_and_voice' ) {

				this.quickStartTextAndVoice()

			}

			this.quickStartToolCall()

		}

		/**
		 * MCP
		 */
		this.mcpHelper = new MCPHelper(this)
		this.mcp = {
			availableTools: [],
			availableModels: [],
			availableFunctions: [],
		}

		/**
		 * Initial messages.
		 */
		this.disclaimer = this.options.disclaimer
		this.presentation = this.options.presentation

		/**
		 * Time.
		 */
		const d = new Date()
		this.lastInteraction = d.getTime()
		this.session_timeout = 30 // minutes
		this.one_minute = 1000 * 60

		/**
		 * State.
		 */
		this.calling_backend = false
		this.history_loaded = false
		this.history = []
		this.loaded_ui_count = 0
		this.ui_count = this.options.plugins.length + this.options.core.length

		/**
		 * Plugins' key rings.
		 */
		this.inputs = {} // list of input plugins
		this.outputs = {} // list of output plugins
		this.ui_outputs = {} // list of output plugins

		/**
		 * Message queue.
		 */
		this.queue = []

		/**
		 * Language.
		 */
		if ( ! options.language )
			this.current_language = 'en-us'
		else
			this.current_language = options.language.toLowerCase()

		/**
		 * Storage to persist dialog during web navigation.
		 */
		if ( this.options.storage_side != 'backend' ) {
			this.botStorage = WebStorage.createInstance({
				driver: 'localStorage',
				keyPrefix: 'bot-storage/'
			})
		}

		/**
		 * Cryptography
		 */
		const workerUrl = new URL( './Libs/CriptoWorker.js', import.meta.url );
		this.crypto_worker = new Worker( workerUrl, {type:'module'} );
		this.crypto_keys = new CryptoKeys( 'cryptoKey', this.botStorage, this.session_timeout )

		/**
		 * Event emitter.
		 */
		this.eventEmitter = new EventEmitter()

		/**
		 * Initialize history array before SessionAdapter
		 */
		this.history = []

		/**
		 * Session adapter
		 */
		this.sessionAdapter = new BotSessionAdapter(this, {
			session_timeout: this.session_timeout,
			crypto_worker: this.crypto_worker,
			storage_side: this.options.storage_side
		})

		/**
		 * Bot orchestrator
		 */
		this.orchestrator = new BotOrchestrator(this)

		/**
		 * Sync tabs / windows.
		 */
		this.bc = new BroadcastChannel( 'bot' )
		this.bc.addEventListener( 'message', ( e )=>{
			if ( e.data[0] == 'core.input_received' ) {
				this.eventEmitter.trigger( 'core.other_window_input', [e.data[1]] )
			} else if ( e.data[0] == 'core.output_ready' ) {
				this.eventEmitter.trigger( 'core.other_window_output', [e.data[1]] )
			}
		})

		/**
		 * Back end assistant.
		 */
		this.orchestrator.registerBackend({
			engine: this.options.engine,
			endpoint: this.options.engine_endpoint,
			engine_specific: this.options.engine_specific
		})

		/**
		 * Color scheme
		 */
		if ( ! options.color )
			this.color = 'blue'
		else
			this.color = options.color

		this.color_schemes = {
			blue: {
				primary: 'rgb(0, 100, 255)',
				primary_hover: 'rgb(0, 81, 205)',
				light: 'rgb(184, 212, 255)',
				dark: 'rgb(53, 76, 164)',
				user: 'rgb(219, 233, 255)',
			},
			green: {
				primary: 'rgb(46, 201, 0)',
				primary_hover: 'rgb(12, 164, 0)',
				light: 'rgb(197, 244, 203)',
				dark: 'rgb(53, 164, 63)',
				user: 'rgb(213, 247, 213)',
			},
			red: {
				primary: 'rgb(201, 0, 0)',
				primary_hover: 'rgb(164, 0, 0)',
				light: 'rgb(255, 224, 212)',
				dark: 'rgb(164, 53, 53)',
				user: 'rgb(255, 224, 212)',
			},
			yellow: {
				primary: 'rgb(218, 190, 0)',
				primary_hover: 'rgb(194, 169, 0)',
				light: 'rgb(247, 240, 188)',
				dark: 'rgb(171, 149, 0)',
				user: 'rgb(247, 240, 188)',
			},
			pink: {
				primary: 'rgb(231, 40, 212)',
				primary_hover: 'rgb(195, 29, 179)',
				light: 'rgb(255, 214, 251)',
				dark: 'rgb(181, 70, 170)',
				user: 'rgb(255, 214, 251)',
			},
			orange: {
				primary: 'rgb(255, 119, 0)',
				primary_hover: 'rgb(230, 107, 0)',
				light: 'rgb(255, 220, 190)',
				dark: 'rgb(209, 114, 31)',
				user: 'rgb(255, 220, 190)',
			},
			purple: {
				primary: 'rgb(177, 0, 255)',
				primary_hover: 'rgb(153, 0, 221)',
				light: 'rgb(240, 205, 255)',
				dark: 'rgb(152, 78, 185)',
				user: 'rgb(240, 205, 255)',
			},
			black: {
				primary: 'rgb(0, 0, 0)',
				primary_hover: 'rgb(40, 40, 40)',
				light: 'rgb(240, 240, 240)',
				dark: 'rgb(150, 150, 150)',
				user: 'rgb(200, 200, 200)',
			},
			gray: {
				primary: 'rgb(180, 180, 180)',
				primary_hover: 'rgb(220, 220, 220)',
				light: 'rgb(240, 240, 240)',
				dark: 'rgb(150, 150, 150)',
				user: 'rgb(200, 200, 200)',
			},
		}

		/**
		 * Custom color scheme
		 */
		if ( options.color_scheme ) {
			this.color_schemes[ options.color ] = options.color_scheme
		}
		if ( this.color_schemes[ this.color ] == undefined ) {
			console.warn( 'Can not find the requested color scheme. It will be blue.' )
			this.color = 'blue'
		}

		/**
		 * Load plugins.
		 */
		this.orchestrator.loadPlugins()

		
		/**
		 * Send messages to backend.
		 */
		this.eventEmitter.on( 'core.send_to_backend', ( payload )=>{
			this.orchestrator.sendToBackend( payload )
		})

		/**
		 * Send to backend the next message on queue.
		 */
		this.eventEmitter.on( 'core.backend_responded', ()=>{
			this.orchestrator.nextQueuedMessage()
		})

		/**
		 * Spread output to all plugins.
		 */
		this.eventEmitter.on( 'core.spread_output', ( output, force )=>{
			this.orchestrator.spreadOutput( output, force )
		})

		/**
		 * Receive an input to store.
		 */
		this.eventEmitter.on( 'core.input', ( input )=>{
			this.orchestrator.input( input )
		})

		/**
		 * Count new UI loaded.
		 */
		this.eventEmitter.on( 'core.ui_loaded', ( plugin )=>{
			this.orchestrator.UILoaded( plugin )
		})

		/**
		 * Renew user session.
		 */
		this.eventEmitter.on( 'core.renew_session', ()=>{
			this.renewSession()
		})

		/**
		 * Get tool use result to send as a response to backend.
		 */
		this.eventEmitter.on( 'core.action_success', ( response )=>{
			this.backend.actionSuccess( response )
		})

		/**
		 * Handle MCP tool feedback
		 */
		this.eventEmitter.on( 'mcp.tool_feedback_received', ( feedback )=>{
			this.orchestrator.handleToolFeedback( feedback )
		})

		/**
		 * Make the bot redirect all inputs to one plugin instead of back end.
		 */
		this.eventEmitter.on( 'core.redirect_input', ( plugin )=>{
			this.redirectInput = plugin
		})

	}

	/**
	 * Remove special characters.
	 * @param  String input Input string.
	 * @return String       String sanitized.
	 */
	sanitizePluginName ( input ) {

		const reg = /[^a-zA-Z0-9]/gi
		return input.replace( reg, '' )

	}

	/**
	 * Convert a string to camel case. Work only for the first letter for now.
	 * @param  String   str Original string.
	 * @return String       Camel case string.
	 */
	camelcase ( str ) {

		return str.charAt(0).toUpperCase() + str.slice(1)

	}

	/**
	 * Add event and messages to bot history.
	 * @param  Object 	obj 	P
	 * @param  String	plugin	Plugin name.
	 */
	async addToHistory ( type, plugin, payload, title = null ) {

		await this.sessionAdapter.addToHistory( type, plugin, payload, title )
		this.eventEmitter.trigger( 'core.history_added' )

	}

	/**
	 * Get history from storage.
	 * @return void
	 */
	async rebuildHistory () {

		await this.sessionAdapter.rebuildHistory()
		this.history_loaded = true
		this.eventEmitter.trigger( 'core.history_loaded' )

	}

	/**
	 * Check if session is expired. Its important that this.session_timeout is equal to 
	 * bot engine session timeout. In RASA, for example, its the session_expiration_time 
	 * in domain.yml.
	 * @return void
	 */
	checkSessionExpired () {

		return this.sessionAdapter.checkSessionExpired()

	}

	clearSessionIfExpired () {

		this.sessionAdapter.clearSessionIfExpired()

	}

	/**
	 * Clear web storage.
	 * @return void
	 */
	clearStorage () {

		this.sessionAdapter.clearStorage()
		this.eventEmitter.trigger( 'core.history_cleared' )

	}

	/**
	 * Renew the session start time.
	 * @param  Integer  time Time in milisseconds
	 * @return void
	 */
	renewSession ( time = null ) {

		this.sessionAdapter.renewSession( time )
		this.eventEmitter.trigger( 'core.history_renewed' )

	}

	/**
	 * Add text channels using a simple config.
	 * @return Void
	 */
	quickStartText () {

		let text_input_config = {
		  plugin: 'Text',
		  type: 'input',
		  start_open: true,
		  no_css: false,
		  autofocus: false,
		}
		this.options.core.push( text_input_config )

		let text_output_config = {
		  plugin: 'Text',
		  type: 'output',
		}
		this.options.core.push( text_output_config )

	}

	/**
	 * Add voice channels using a simple config.
	 * @return Void
	 */
	quickStartVoice () {

		this.quickStartText()

		let VTT_ui_config = {
		  plugin: 'Voice',
		  type: 'input',
		  prioritize_speech: true,
		  hide_text_ui: true,
		}
		this.options.core.push( VTT_ui_config )

		let voice_ui_config = {
		  plugin: 'Voice',
		  type: 'output',
		  name: 'Zarvox', // en-US
		  hide_text_ui: true,
		}
		this.options.core.push( voice_ui_config )

	}

	/**
	 * Add tool call channel using a simple config.
	 * @return Void
	 */
	quickStartToolCall () {

		let bots_commands_config = {
		  plugin: 'BotsCommands',
		  type: 'output',
		}
		this.options.core.push( bots_commands_config )

	}

	/**
	 * Add text and voice channels using a simple config.
	 * @return Void
	 */
	quickStartTextAndVoice () {

		this.quickStartText()
		this.quickStartVoice()

	}

	async cryptography ( data, action ) {

		return await this.sessionAdapter.cryptography(data, action)

	}

}

