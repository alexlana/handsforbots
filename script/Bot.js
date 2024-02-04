/**
 * 
 * Now the bot can use the UI!
 * 
 * Simple flow:
 * 
 * Text					|									|  Text
 * Voice				|									|  Voice
 * Gesture (TODO)		|   > input >   [*_*]   > output >	|  UI (TODO)
 * Mouse/Pointer (TODO)	|
 * Trigger/Poke			|									|  Bot's Commands
 * 
 */


// HOSTER


import TextInput from './Input/Text.js'
import VoiceInput from './Input/Voice.js'
import PokeInput from './Input/Poke.js'

import TextOutput from './Output/Text.js'
import VoiceOutput from './Output/Voice.js'
import BotsCommandsOutput from './Output/BotsCommands.js'

import WebStorage from './Libs/WebStorage.umd.min.js'
import EventEmitter from './Libs/EventEmitter.js'


/**
 * Set bot instance to load same instance trought plugins.
 * @type Null|Object
 */
let bot_instance = null

/**
 * Bot core.
 */
export default class Bot {

	/**
	 * Bot core constructor.
	 */
	constructor ( options ) {

		if ( bot_instance )
			return bot_instance
		bot_instance = this

		console.log( '[-_-] The bot is on the production line. [-_-]' )

		if ( ! options.language )
			this.current_language = 'en'
		else
			this.current_language = options.language

		this.action_tag_open = '[*'
		this.action_tag_close = '*]'

		this.session_timeout = 30 // minutes
		this.one_minute = 1000 * 60

		this.history_loaded = false

		this.options = options
		this.loaded_ui_count = 0
		this.ui_count = this.options.plugins.length + this.options.inputs.length + this.options.outputs.length

		this.botStorage = WebStorage.createInstance({
		  driver: 'localStorage',
		  keyPrefix: 'bot-storage/'
		})
		this.eventEmitter = new EventEmitter()

		this.disclaimer = options.disclaimer
		this.presentation = options.presentation

		this.rebuildHistory() // history of bot events

		let engine_specific = null
		if ( options.engine_specific != undefined )
			engine_specific = options.engine_specific
		this.registerBackend({
			engine: options.engine,
			endpoint: options.engine_endpoint,
			engine_specific: engine_specific
		})

		this.inputs = {} // list of input plugins
		this.outputs = {} // list of output plugins
		this.ui_outputs = {} // list of output plugins

		this.textInput = new TextInput() // Text Input plugin
		this.voiceInput = new VoiceInput() // Voice Input plugin (speech to text / VTT)
		this.pokeInput = new PokeInput() // Poke Input plugin

		this.textOutput = new TextOutput() // Text output plugin
		this.voiceOutput = new VoiceOutput() // Text output plugin (text to speech / TTS)
		this.botsCommandsOutput = new BotsCommandsOutput() // Bot's Commands output plugin

		const d = new Date()
		this.lastInteraction = d.getTime()

		this.loadInterfaces()

	}

	async loadInterfaces () {

		/**
		 * Load plugins, inputs and outputs.
		 */
		await Promise.all(this.options.plugins.map( async ( obj ) => {
			await this.pluginUi(obj)
		}))
		await Promise.all(this.options.inputs.map( async ( obj )=>{
			await this.ui( obj, 'input' )
		}))
		await Promise.all(this.options.outputs.map( async ( obj )=>{
			await this.ui( obj, 'output' )
		}))

	}

	UILoaded (plugin) {

		this.loaded_ui_count++

		if ( this.loaded_ui_count == this.ui_count ) {
			if ( this.history.length == 0 ) {
				if ( this.presentation != undefined ) {
					this.output( this.presentation )
				}
			}
		}

	}


	/**
	 * Bot input caller.
	 * @param  string|stream	payload	Input payload.
	 * @param  string			plugin	Input plugin name.
	 * @return void
	 */
	input ( plugin, payload, title = null ) {

		if ( !plugin )
			throw new Error( 'The parameter "plugin" is required.' );
		if ( !payload )
			throw new Error( 'The parameter "payload" is required.' );

		this.inputs[ plugin ].input( payload, title ) // send payload to plugin
		this.addToHistory( 'input', plugin, payload, title ) // add event to bot history

	}

	/**
	 * Bot output caller.
	 * @param  string|stream	payload	Output payload.
	 * @param  string			plugin	Output plugin name.
	 * @return void
	 */
	output ( payload ) {

		payload = this.extractActions( payload );

		let plugins = []
		for ( var plugin in this.ui_outputs ) {
			this.outputs[ plugin ].output( payload ) // show payload
			plugins.push( plugin )
		}
		this.addToHistory( 'output', plugins, JSON.stringify( payload ) ) // add event to bot history

	}

	/**
	 * Register bot input plugins.
	 * @param  Object	obj Input plugin object.
	 * @return void
	 */
	registerInput ( obj ) {

		if ( !obj.name )
			throw new Error( 'The parameter "name" (input name) is required.' );

		this.inputs[ obj.name ] = obj // add input plugin to list

	}

	/**
	 * Register bot output plugins.
	 * @param  Object	obj		Output plugin object.
	 * @return void
	 */
	registerOutput ( obj ) {

		if ( !obj.name )
			throw new Error( 'The parameter "name" (output name) is required.' );

		this.outputs[ obj.name ] = obj // add output plugin to list

	}

	/**
	 * Register bot backend engine.
	 * @param  Object	obj		Backend object.
	 * @return void
	 */
	async registerBackend ( options ) {

		let engine_specific = null
		if ( options.engine_specific != undefined )
			engine_specific = options.engine_specific

		if ( !options.engine || options.engine.toLowerCase() == 'rasa' ) {
			let BackendEngine = await import( './Backend/Rasa.js' )
			this.backend = new BackendEngine.default( {endpoint: options.endpoint, engine_specific: engine_specific} )
		} else if ( !options.engine || options.engine.toLowerCase() == 'openai' ) {
			let BackendEngine = await import( './Backend/OpenAI.js' )
			this.backend = new BackendEngine.default( {endpoint: options.endpoint, engine_specific: engine_specific} )
		}

		console.log('★  [*_*] The bot is assembled and ready. [*_*]  ★')

	}

	/**
	 * Set plugin UI at DOM.
	 * @param  Object	options	Information about plugin `type` and plugin `name` as well as plugin parameters.
	 * @return Void
	 */
	async ui ( options, type ) {

		if ( !options.type && !type )
			throw new Error( 'The parameter "type" (input or output) is required.' );
		if ( !options.plugin )
			throw new Error( 'The parameter "plugin" (the plugin name) is required.' );

		if ( options.type )
			type = options.type

		if ( type == 'output' )
			this.ui_outputs[ options.plugin ] = true
		this[ type+'s' ][ options.plugin ].ui( options ) // load UI of plugin

	}

	/**
	 * Set custom plugin UI at DOM. It will activate plugins in `Plugins` folder.
	 * You want to inform the plugin's name throught the `options` like: `{plugin: "MyPlugin"}`.
	 * The name is the name of the main folder of your package, AND the name of the main .js
	 * file (ex.: `/Plugins/MyPlugin/MyPlugin.js`), AND the name of the class (ex.: `export default class MyPlugin { constructor() { } }`).
	 * The plugin name can only have letters and numbers, no special characters is allowed.
	 * @param  Object	options	Information about plugin `type` and plugin `name` as well as plugin parameters.
	 * @return Void
	 */
	async pluginUi ( options ) {

		try {

			if ( !options.plugin )
				throw new Error( 'The parameter "plugin" (the plugin name) is required.' )

			const plugin = this.sanitize_input( options.plugin )
			if ( !plugin || plugin === '' )
				throw new Error( 'The parameter "plugin" (the plugin name) can use only letters and numbers, and no accent or special characters.' )

			let type = null
			await import( /* @vite-ignore */ './Plugins/' + plugin + '/' + plugin + '.js' )
				  .then(({ default: LoadedPlugin }) => {
				  	const LoadedPluginInit = new LoadedPlugin( options );
					this[ LoadedPluginInit.name ] = LoadedPluginInit
					type = this[ LoadedPluginInit.name ].type()
				  })

			if ( type != 'input' && type != 'output' )
				throw new Error( 'The valid values for "type" are "input" or "output".' )

			if ( type == 'output' )
				this.ui_outputs[ plugin ] = true
			this[ type +'s' ][ plugin ].ui( options ) // load UI of plugin

		} catch ( err ) {

			throw new Error( `Error on load plugin: ${err}` )

		}

	}

	/**
	 * Remove special characters.
	 * @param  String input Input string.
	 * @return String       String sanitized.
	 */
	sanitize_input ( input ) {

		const reg = /[^a-zA-Z0-9]/gi
		return input.replace( reg, '' )

	}

	/**
	 * Add event to bot history.
	 * @param  Object 	obj 	P
	 * @param  String	plugin	Plugin name.
	 */
	addToHistory ( type, plugin, payload, title = null ) {

		if ( !type )
			throw new Error( 'The parameter "type" (input or output) is required.' );
		if ( !plugin )
			throw new Error( 'The parameter "plugin" (the plugin name) is required.' );
		if ( !payload )
			throw new Error( 'The parameter "payload" (event\'s data) is required.' );

		const history = [ type, plugin, payload, title ] // history event item
		this.history.push( history ) // add event to history

		const d = new Date()
		this.renewSession( d.getTime() )
		this.botStorage.setItem( 'history', JSON.stringify( this.history ), error => { console.error(error) })
		this.botStorage.setItem( 'time', this.lastInteraction, error => { console.error(error) })

	}

	/**
	 * Get history from cookies.
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
	}

	/**
	 * Extract actions from outputs.
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
	async sendToBackend ( plugin, payload ) {

		for ( var _plugin in this.outputs ) {
			this.outputs[ _plugin ].waiting() // waiting signal
		}

		let response = await this.backend.send( plugin, payload )

		return response

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
		this.eventEmitter.trigger( 'history_cleared' )

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
