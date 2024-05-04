/**
 * 
 * Now the bot can use the UI! It puts de conversation at the center of interactions.
 * 
 * Simple flow:
 *
 * Inputs: 				|   > input >   [*_*]   > output >	|  Outputs:
 * Text					|									|  Text
 * Voice				|									|  Voice
 * Gesture (TODO)		|									|  UI (TODO)
 * Trigger/Poke			|									|  Bot's Commands
 * 
 */



import WebStorage from './Libs/WebStorage.umd.min.js'
import EventEmitter from './Libs/EventEmitter.js'



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
		this.action_tag_open = '[*'
		this.action_tag_close = '*]'

		/**
		 * Global options.
		 */
		this.options = options

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
		this.botStorage = WebStorage.createInstance({
		  driver: 'localStorage',
		  keyPrefix: 'bot-storage/'
		})

		/**
		 * Event emitter.
		 */
		this.eventEmitter = new EventEmitter()

		/**
		 * Back end assistant.
		 */
		this.registerBackend({
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
		this.loadPlugins()

		/**
		 * Send messages to backend.
		 */
		this.eventEmitter.on( 'core.send_to_backend', ( payload )=>{
			this.sendToBackend( payload )
		})

		/**
		 * Send to backend the next message on queue.
		 */
		this.eventEmitter.on( 'core.backend_responded', ()=>{
			this.nextQueuedMessage()
		})

		/**
		 * Spread output to all plugins.
		 */
		this.eventEmitter.on( 'core.spread_output', ( output )=>{
			this.spreadOutput( output )
		})

		/**
		 * Receive an input to store.
		 */
		this.eventEmitter.on( 'core.input', ( input )=>{
			this.input( input )
		})

		/**
		 * Count new UI loaded.
		 */
		this.eventEmitter.on( 'core.ui_loaded', ( plugin )=>{
			this.UILoaded( plugin )
		})

		/**
		 * Renew user session.
		 */
		this.eventEmitter.on( 'core.renew_session', ()=>{
			this.renewSession()
		})

	}

	/**
	 * Load plugins (inputs and outputs, core and custom).
	 * @return Void
	 */
	async loadPlugins () {

		let loadSequence = []
		for ( const core_plugin of this.options.core ) {
			loadSequence.push( core_plugin )
			await this.pluginLoader( core_plugin, 'Core' );
		}
		for ( const custom_plugin of this.options.plugins ) {
			loadSequence.push( custom_plugin )
			await this.pluginLoader( custom_plugin, 'Plugins' );
		}

		for ( const plugin of loadSequence ) {
			this[ plugin.type +'s' ][ plugin.plugin ].ui( plugin ) // load UI of plugin
		}

		this.rebuildHistory() // history of bot events and dialogs.
		if ( this.history.length == 0 ) {
			if ( this.presentation != undefined ) {
				this.spreadOutput( this.presentation )
			}
		}

	}

	/**
	 * Register number of plugins loaded and trigger an event on complete.
	 * @param Void
	 */
	UILoaded (plugin) {

		this.loaded_ui_count++

		if ( this.loaded_ui_count == this.ui_count ) {
			this.eventEmitter.trigger( 'core.ui_loaded' )
		}

	}

	/**
	 * Register user inputs in history.
	 * @param  string|stream	payload	Input payload.
	 * @param  string			plugin	Input plugin name.
	 * @return void
	 */
	input ( input ) {

		if ( !input.plugin )
			throw new Error( 'The parameter "plugin" is required.' )
		if ( !input.payload )
			throw new Error( 'The parameter "payload" is required.' )

		this.addToHistory( 'input', input.plugin, input.payload, input.title ) // add event to bot history
		this.eventEmitter.trigger( 'core.input_received' )

	}

	/**
	 * Register assistant and plugins output into history, or do nothing when input redirections is activated.
	 * @param  string|stream	payload	Output payload.
	 * @return void
	 */
	spreadOutput ( payload ) {

		if ( !payload || this.redirectInput )
			return

		payload = this.extractActions( payload )

		let plugins = []
		for ( var plugin in this.ui_outputs ) {
			plugins.push( plugin )
		}
		this.addToHistory( 'output', plugins, JSON.stringify( payload ) ) // add event to bot history
		this.eventEmitter.trigger( 'core.output_ready', [payload] )

	}

	/**
	 * Register bot backend engine.
	 * @param  Object	obj		Backend object.
	 * @return Void
	 */
	async registerBackend ( options ) {

		let engine_specific = null
		if ( options.engine_specific != undefined )
			engine_specific = options.engine_specific

		if ( !options.engine || options.engine.toLowerCase() == 'rasa' ) {
			let BackendEngine = await import( './Core/Backend/Rasa.js' )
			this.backend = new BackendEngine.default( this, {endpoint: options.endpoint, engine_specific: engine_specific} )
		} else if ( !options.engine || options.engine.toLowerCase() == 'openai' ) {
			let BackendEngine = await import( './Core/Backend/OpenAI.js' )
			this.backend = new BackendEngine.default( this, {endpoint: options.endpoint, engine_specific: engine_specific} )
		}

		console.log('★  [*_*] The bot is assembled and ready. [*_*]  ★')
		this.eventEmitter.trigger( 'core.loaded' )

	}

	/**
	 * Set plugin's UI at DOM. It will activate plugins in `Core` or `Plugins` folder.
	 * You want to inform the plugin's name throught the `options` like: `{plugin: "MyPlugin"}`.
	 * The name is the name of the main folder of your package, AND the name of the main .js
	 * file (ex.: `/Plugins/MyPlugin/MyPlugin.js`), AND the name of the class (ex.: `export default class MyPlugin { constructor() { } }`).
	 * The plugin name can only have letters and numbers, no special characters is allowed.
	 * @param  Object	options	Information about plugin `type` and plugin `name` as well as plugin parameters.
	 * @param  String	source	Tell if the plugin is from `Core` or is a custom plugin from `Plugins` folder.
	 * @return Void
	 */
	async pluginLoader ( options, source ) {

		try {

			if ( !options.plugin )
				throw new Error( 'The parameter "plugin" (the plugin name) is required.' )
			if ( options.type != 'input' && options.type != 'output' )
				throw new Error( 'The valid values for "type" are "input" or "output".' )

			const plugin = this.sanitizePluginName( options.plugin )
			if ( !plugin || plugin === '' )
				throw new Error( 'The parameter "plugin" (the plugin name) can use only letters and numbers, and no accent or special characters.' )
			let type = options.type
			let import_path = './' + source + '/' + this.camelcase( options.type ) + '/' + plugin + '/' + plugin + '.js'

			await import( /* @vite-ignore */ import_path )
				  .then(({ default: LoadedPlugin }) => {
				  	const LoadedPluginInit = new LoadedPlugin( this, options )
					this[ type +'s' ][ options.plugin ] = LoadedPluginInit
				  })

			if ( type == 'output' )
				this.ui_outputs[ plugin ] = true

		} catch ( err ) {

			throw new Error( `Error on load plugin: ${err}` )

		}

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
	addToHistory ( type, plugin, payload, title = null ) {

		if ( !type )
			throw new Error( 'The parameter "type" (input or output) is required.' )
		if ( !plugin )
			throw new Error( 'The parameter "plugin" (the plugin name) is required.' )
		if ( !payload )
			throw new Error( 'The parameter "payload" (event\'s data) is required.' )

		const history = [ type, plugin, payload, title ] // history event item
		this.history.push( history ) // add event to history

		const d = new Date()
		this.renewSession( d.getTime() )
		this.botStorage.setItem( 'history', JSON.stringify( this.history ), error => { console.error(error) })
		this.botStorage.setItem( 'time', this.lastInteraction, error => { console.error(error) })

		this.eventEmitter.trigger( 'core.history_added' )

	}

	/**
	 * Get history from storage.
	 * @return void
	 */
	rebuildHistory () {
		const d = new Date()
		const h = this.botStorage.getItem( 'history', error => { console.error(error) } )
		const old_time = this.botStorage.getItem( 'time', error => { console.error(error) } )
		this.renewSession( d.getTime() )
		if ( h ) {
			if ( old_time && old_time < this.lastInteraction - (this.one_minute * this.session_timeout) ) {
				this.clearStorage()
			} else {
				this.history = JSON.parse( h )
			}
		} else {
			this.history = []
		}

		this.history_loaded = true
		this.eventEmitter.trigger( 'core.history_loaded' )
	}

	/**
	 * Extract actions from output messages.
	 * @param  array	payload		Payload data.
	 * @return array 	payload 	Payload processed.
	 */
	extractActions ( payload ) {

		payload.map(( obj )=>{

			obj.do = null
			if ( obj.text.indexOf( this.action_tag_open ) > -1 ) {
				let part1 = obj.text.substr( 0, obj.text.indexOf( this.action_tag_open ) )
				let part2 = obj.text.substr( obj.text.indexOf( this.action_tag_close ) + this.action_tag_close.length )
				let to_say = part1 + part2

				let to_do = obj.text.substr( obj.text.indexOf( this.action_tag_open ) + this.action_tag_open.length )
				to_do = to_do.substr( 0, to_do.indexOf( this.action_tag_close ) )
				obj.text = to_say
				obj.do = to_do
			}

		})

		return payload

	}

	/**
	 * Send data to backend and wait for response.
	 * @param  String	plugin	What plugin want to send this payload.
	 * @param  String	payload Data to send to back end.
	 * @return String	json	Backend response.
	 */
	async sendToBackend ( payload ) {

		if ( this.calling_backend ) {
			this.addToQueue( payload )
			return
		}

		let response = '';

		if ( this.redirectInput ) {
			response = this.outputs[ this.redirectInput ].redirectedInput( payload.payload )
			this.eventEmitter.trigger( payload.trigger, [response] )
			return
		}

		this.eventEmitter.trigger( 'core.calling_backend' )
		response = await this.backend.send( payload.plugin, payload.payload )
		this.eventEmitter.trigger( 'core.backend_responded' )
		this.eventEmitter.trigger( payload.trigger, [response] )

	}

	/**
	 * Create a queue when new events / messages arrive before back end response for the previous one.
	 * @param Object payload Payload to the back end.
	 */
	addToQueue ( payload ) {

		this.queue.append( payload )

	}

	/**
	 * Send the next message / event in the queue to the back end, if any.
	 * @return Void | Null
	 */
	nextQueuedMessage () {

		if ( this.queue.length == 0 ) {
			return
		}

		let payload = this.queue.shift()
		this.sendToBackend( payload )

	}

	/**
	 * Check if session is expired. Its important that this.session_timeout is equal to 
	 * bot engine session timeout. In RASA, for example, its the session_expiration_time 
	 * in domain.yml.
	 * @return void
	 */
	checkSessionExpired () {

		const d = new Date()
		if ( this.lastInteraction < d.getTime() - (this.one_minute * this.session_timeout) ) {
			if ( this.history.length == 0 ) {
				this.renewSession( d.getTime() )
				return
			}
			this.clearStorage()
		} else {
			let divider = 2
			if ( d.getTime() - this.lastInteraction > (this.one_minute * this.session_timeout) * 0.9 ) // if 90% of the session time has passed
				divider = 1000
			setTimeout( ( bot )=>{ bot.checkSessionExpired() }, this.one_minute/divider, this )
		}

	}

	/**
	 * Clear web storage.
	 * @return void
	 */
	clearStorage () {

		this.botStorage.removeItem( 'history' )
		this.history = []
		this.eventEmitter.trigger( 'core.history_cleared' )

	}

	/**
	 * Renew the session start time.
	 * @param  Integer  time Time in milisseconds
	 * @return void
	 */
	renewSession ( time ) {

		this.lastInteraction = time
		this.checkSessionExpired()

	}

}
