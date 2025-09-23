/**
 * BotOrchestrator - Orquestrador de funcionalidades do Bot
 * Responsável por: coordenação de plugins, fluxo de dados, backend integration, MCP tools
 * 
 * Separa as responsabilidades operacionais do Bot.js core, mantendo compatibilidade total
 */

export default class BotOrchestrator {

	/**
	 * BotOrchestrator constructor
	 * @param {Object} bot - Instância do Bot
	 * @param {Object} options - Opções de configuração
	 */
	constructor(bot, options = {}) {
		this.bot = bot

		// Estado de orquestração
		this.callingBackend = false
		this.loadedUICount = 0
		this.redirectInput = null

		console.log('[✔︎] BotOrchestrator initialized.')
	}

	/**
	 * Getter para histórico - sempre acessa this.bot.history
	 * @return {Array} Histórico do bot
	 */
	get history() {
		return this.bot.history
	}

	/**
	 * Setter para histórico - sempre atualiza this.bot.history
	 * @param {Array} newHistory - Novo histórico
	 */
	set history(newHistory) {
		this.bot.history = newHistory
	}

	/**
	 * Getter para queue - sempre acessa this.bot.queue
	 * @return {Array} Queue do bot
	 */
	get queue() {
		return this.bot.queue
	}

	/**
	 * Getter para inputs - sempre acessa this.bot.inputs
	 * @return {Object} Inputs do bot
	 */
	get inputs() {
		return this.bot.inputs
	}

	/**
	 * Getter para outputs - sempre acessa this.bot.outputs
	 * @return {Object} Outputs do bot
	 */
	get outputs() {
		return this.bot.outputs
	}

	/**
	 * Getter para ui_outputs - sempre acessa this.bot.ui_outputs
	 * @return {Object} UI Outputs do bot
	 */
	get ui_outputs() {
		return this.bot.ui_outputs
	}

	/**
	 * Getter para eventEmitter - sempre acessa this.bot.eventEmitter
	 * @return {Object} EventEmitter do bot
	 */
	get eventEmitter() {
		return this.bot.eventEmitter
	}

	/**
	 * Getter para mcpHelper - sempre acessa this.bot.mcpHelper
	 * @return {Object} MCPHelper do bot
	 */
	get mcpHelper() {
		return this.bot.mcpHelper
	}

	/**
	 * Getter para backend - sempre acessa this.bot.backend
	 * @return {Object} Backend do bot
	 */
	get backend() {
		return this.bot.backend
	}

	/**
	 * Getter para mcp - sempre acessa this.bot.mcp
	 * @return {Object} MCP do bot
	 */
	get mcp() {
		return this.bot.mcp
	}

	/**
	 * Getter para action tags - sempre acessa this.bot
	 * @return {string} Action tag open
	 */
	get action_tag_open() {
		return this.bot.action_tag_open
	}

	/**
	 * Getter para action tags - sempre acessa this.bot
	 * @return {string} Action tag close
	 */
	get action_tag_close() {
		return this.bot.action_tag_close
	}

	/**
	 * Getter para ui_count - sempre acessa this.bot.ui_count
	 * @return {number} UI count do bot
	 */
	get ui_count() {
		return this.bot.ui_count
	}

	/**
	 * Getter para calling_backend - usa estado local do orchestrator
	 * @return {boolean} Se está chamando backend
	 */
	get calling_backend() {
		return this.callingBackend
	}

	/**
	 * Setter para calling_backend - atualiza estado local e do bot
	 * @param {boolean} value - Novo valor
	 */
	set calling_backend(value) {
		this.callingBackend = value
		this.bot.calling_backend = value
	}

	/**
	 * Getter para loaded_ui_count - usa estado local do orchestrator
	 * @return {number} UI count carregado
	 */
	get loaded_ui_count() {
		return this.loadedUICount
	}

	/**
	 * Setter para loaded_ui_count - atualiza estado local e do bot
	 * @param {number} value - Novo valor
	 */
	set loaded_ui_count(value) {
		this.loadedUICount = value
		this.bot.loaded_ui_count = value
	}

	// ==============================================
	// MÉTODOS QUE SERÃO MIGRADOS GRADUALMENTE
	// ==============================================

	/**
	 * Load plugins (inputs and outputs, core and custom).
	 * MIGRADO DO BOT.JS - implementação completa
	 * @return Void
	 */
	async loadPlugins() {
		let loadSequence = []
		for (const core_plugin of this.bot.options.core) {
			loadSequence.push(core_plugin)
			await this.pluginLoader(core_plugin, 'Core');
		}
		for (const custom_plugin of this.bot.options.plugins) {
			loadSequence.push(custom_plugin)
			await this.pluginLoader(custom_plugin, 'Plugins');
		}

		for (const plugin of loadSequence) {
			this.bot[plugin.type + 's'][plugin.plugin].ui(plugin) // load UI of plugin
		}

		await this.rebuildHistory() // history of bot events and dialogs.
		if (this.history.length == 0) {
			if (this.bot.presentation != undefined) {
				this.spreadOutput(this.bot.presentation)
			}
		}
	}

	/**
	 * Set plugin's UI at DOM.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  Object	options	Information about plugin
	 * @param  String	source	Tell if the plugin is from Core or Plugins folder
	 * @return Void
	 */
	async pluginLoader(options, source) {
		try {
			if (!options.plugin)
				throw new Error('The parameter "plugin" (the plugin name) is required.')
			if (options.type != 'input' && options.type != 'output')
				throw new Error('The valid values for "type" are "input" or "output".')

			const plugin = this.bot.sanitizePluginName(options.plugin)
			if (!plugin || plugin === '')
				throw new Error('The parameter "plugin" (the plugin name) can use only letters and numbers, and no accent or special characters.')
			let type = options.type
			let import_path = '../' + source + '/' + this.bot.camelcase(options.type) + '/' + plugin + '/' + plugin + '.js'

			await import( /* @vite-ignore */ import_path )
				  .then(({ default: LoadedPlugin }) => {
				  	const LoadedPluginInit = new LoadedPlugin(this.bot, options)
					this.bot[type + 's'][options.plugin] = LoadedPluginInit
					
					// Register MCP tools, models, and functions if plugin defines them
					this.registerPluginMCPItems(LoadedPluginInit)
				  })

			if (type == 'output')
				this.bot.ui_outputs[plugin] = true

		} catch (err) {
			throw new Error(`Error on load plugin: ${err}`)
		}
	}

	/**
	 * Register number of plugins loaded and trigger an event on complete.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param Void
	 */
	UILoaded(plugin) {
		this.loaded_ui_count++

		if (this.loaded_ui_count == this.ui_count) {
			this.eventEmitter.trigger('core.all_ui_loaded')
		}
	}

	/**
	 * Register user inputs in history.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  Object	input	Input data
	 * @return void
	 */
	input(input) {
		if (!input.plugin)
			throw new Error('The parameter "plugin" is required.')
		if (!input.payload)
			throw new Error('The parameter "payload" is required.')

		this.addToHistory('input', input.plugin, input.payload, input.title) // add event to bot history
		this.eventEmitter.trigger('core.input_received')

		let bc_input = ['core.input_received', input.payload]
		this.bot.bc.postMessage(bc_input)
	}

	/**
	 * Register assistant and plugins output into history.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  string|stream	payload	Output payload
	 * @param  boolean			force	Force output despite redirections
	 * @return void
	 */
	spreadOutput(payload, force) {
		if (!payload || (this.bot.redirectInput && force == undefined))
			return

		payload = this.extractActions(payload)

		let plugins = []
		for (var plugin in this.ui_outputs) {
			plugins.push(plugin)
		}
		this.addToHistory('output', plugins, JSON.stringify(payload)) // add event to bot history
		this.eventEmitter.trigger('core.output_ready', [payload])

		let bc_output = ['core.output_ready', payload]
		this.bot.bc.postMessage(bc_output)
	}

	/**
	 * Extract actions from output messages.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  array	payload		Payload data
	 * @return array 	payload 	Payload processed
	 */
	extractActions(payload) {
		payload.map(( obj )=>{

			obj.do = null
			
			// Check if obj.text exists and is a string
			if ( obj.text && typeof obj.text === 'string' && obj.text.indexOf( this.action_tag_open ) > -1 ) {
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
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  Object	payload	Data to send to backend
	 * @return String	json	Backend response
	 */
	async sendToBackend(payload) {
		if (this.calling_backend) {
			this.addToQueue(payload)
			return
		}

		let response = '';

		if (this.bot.redirectInput) {
			response = this.outputs[this.bot.redirectInput].redirectedInput(payload.payload)
			this.eventEmitter.trigger(payload.trigger, [response])
			return
		}

		this.eventEmitter.trigger('core.calling_backend')
		this.calling_backend = true
		response = await this.backend.send(payload.plugin, payload.payload)
		response = await this.mcpHelper.processIfHasTools(response)
		this.calling_backend = false
		this.eventEmitter.trigger('core.backend_responded')
		this.eventEmitter.trigger(payload.trigger, [response])
	}

	/**
	 * Create a queue when new events arrive before backend response.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param Object payload Payload to the backend
	 */
	addToQueue(payload) {
		this.queue.push(payload)
	}

	/**
	 * Send the next message in the queue to the backend.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @return Void | Null
	 */
	nextQueuedMessage() {
		if (this.queue.length == 0) {
			return
		}

		let payload = this.queue.shift()
		this.sendToBackend(payload)
	}

	/**
	 * Register MCP tools, models, and functions from a plugin.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  Object plugin The loaded plugin instance
	 * @return Void
	 */
	registerPluginMCPItems(plugin) {
		// Skip if plugin is not an MCP plugin
		if (!plugin.isMCPTool) {
			return
		}

		// Register MCP Tool
		this.registerPluginMCPTool(plugin)
		
		// Register MCP Model
		this.registerPluginMCPModel(plugin)
		
		// Register MCP Function
		this.registerPluginMCPFunction(plugin)
	}

	/**
	 * Register MCP tool from a plugin if defined.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  Object plugin The loaded plugin instance
	 * @return Void
	 */
	registerPluginMCPTool(plugin) {
		if (plugin.getMCPToolDefinition) {
			try {
				const toolDefinition = plugin.getMCPToolDefinition()
				
				// Only proceed if tool definition is valid and not null
				if (toolDefinition && this.validateMCPToolDefinition(toolDefinition)) {
					this.mcpHelper.registerTool(toolDefinition)
					console.log(`[✔︎] MCP Tool "${toolDefinition.name}" registered from plugin "${plugin.name}"`)
				} else if (toolDefinition === null) {
					// Plugin decided not to register a tool (e.g., no elements available)
					console.log(`[ℹ] Plugin "${plugin.name}" skipped MCP tool registration (conditions not met)`)
				} else {
					console.warn(`[⚠] Invalid MCP tool definition from plugin "${plugin.name}"`)
				}
			} catch (error) {
				console.error(`[✗] Error registering MCP tool from plugin "${plugin.name}":`, error)
			}
		}
	}

	/**
	 * Register MCP model from a plugin if defined.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  Object plugin The loaded plugin instance
	 * @return Void
	 */
	registerPluginMCPModel(plugin) {
		if (plugin.getMCPModelDefinition) {
			try {
				const modelDefinition = plugin.getMCPModelDefinition()
				
				// Only proceed if model definition is valid and not null
				if (modelDefinition && this.validateMCPModelDefinition(modelDefinition)) {
					this.mcpHelper.registerModel(modelDefinition)
					console.log(`[✔︎] MCP Model "${modelDefinition.name}" registered from plugin "${plugin.name}"`)
				} else if (modelDefinition === null) {
					// Plugin decided not to register a model
					console.log(`[ℹ] Plugin "${plugin.name}" skipped MCP model registration (conditions not met)`)
				} else {
					console.warn(`[⚠] Invalid MCP model definition from plugin "${plugin.name}"`)
				}
			} catch (error) {
				console.error(`[✗] Error registering MCP model from plugin "${plugin.name}":`, error)
			}
		}
	}

	/**
	 * Register MCP function from a plugin if defined.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  Object plugin The loaded plugin instance
	 * @return Void
	 */
	registerPluginMCPFunction(plugin) {
		if (plugin.getMCPFunctionDefinition) {
			try {
				const functionDefinition = plugin.getMCPFunctionDefinition()
				
				// Only proceed if function definition is valid and not null
				if (functionDefinition && this.validateMCPFunctionDefinition(functionDefinition)) {
					this.mcpHelper.registerFunction(functionDefinition)
					console.log(`[✔︎] MCP Function "${functionDefinition.name}" registered from plugin "${plugin.name}"`)
				} else if (functionDefinition === null) {
					// Plugin decided not to register a function
					console.log(`[ℹ] Plugin "${plugin.name}" skipped MCP function registration (conditions not met)`)
				} else {
					console.warn(`[⚠] Invalid MCP function definition from plugin "${plugin.name}"`)
				}
			} catch (error) {
				console.error(`[✗] Error registering MCP function from plugin "${plugin.name}":`, error)
			}
		}
	}

	/**
	 * Validate MCP tool definition structure.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  Object toolDefinition The tool definition to validate
	 * @return Boolean True if valid, false otherwise
	 */
	validateMCPToolDefinition(toolDefinition) {
		if (!toolDefinition || typeof toolDefinition !== 'object') {
			return false
		}

		// Required fields
		const requiredFields = ['name', 'description', 'parameters', 'execute']
		for (const field of requiredFields) {
			if (!toolDefinition.hasOwnProperty(field)) {
				console.warn(`[⚠] MCP tool definition missing required field: ${field}`)
				return false
			}
		}

		// Validate parameters structure
		if (!toolDefinition.parameters || typeof toolDefinition.parameters !== 'object') {
			console.warn(`[⚠] MCP tool definition has invalid parameters structure`)
			return false
		}

		// Validate execute function
		if (typeof toolDefinition.execute !== 'function') {
			console.warn(`[⚠] MCP tool definition execute must be a function`)
			return false
		}

		return true
	}

	/**
	 * Validate MCP model definition structure.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  Object modelDefinition The model definition to validate
	 * @return Boolean True if valid, false otherwise
	 */
	validateMCPModelDefinition(modelDefinition) {
		if (!modelDefinition || typeof modelDefinition !== 'object') {
			return false
		}
		
		// Required fields for models
		const requiredFields = ['name', 'description']
		for (const field of requiredFields) {
			if (!modelDefinition.hasOwnProperty(field)) {
				console.warn(`[⚠] MCP model definition missing required field: ${field}`)
				return false
			}
		}
		
		return true
	}

	/**
	 * Validate MCP function definition structure.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  Object functionDefinition The function definition to validate
	 * @return Boolean True if valid, false otherwise
	 */
	validateMCPFunctionDefinition(functionDefinition) {
		if (!functionDefinition || typeof functionDefinition !== 'object') {
			return false
		}
		
		// Required fields for functions
		const requiredFields = ['name', 'description']
		for (const field of requiredFields) {
			if (!functionDefinition.hasOwnProperty(field)) {
				console.warn(`[⚠] MCP function definition missing required field: ${field}`)
				return false
			}
		}
		
		return true
	}

	/**
	 * Handle tool feedback from MCP.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param {Object} feedback - Tool feedback data
	 */
	handleToolFeedback(feedback) {
		if (feedback && feedback.success && feedback.feedback) {
			// Add feedback to conversation history
			this.addToHistory('feedback', 'mcp', feedback.feedback, 'Tool Feedback')

			// Optionally display feedback to user
			this.spreadOutput([{
				recipient_id: "user",
				text: feedback.feedback,
				type: "feedback"
			}])
		}
	}

	/**
	 * Add event and messages to bot history.
	 * MÉTODO DELEGADO - delega para sessionAdapter
	 * @param  String	type	Event type
	 * @param  String	plugin	Plugin name
	 * @param  String	payload	Event payload
	 * @param  String	title	Event title
	 */
	async addToHistory(type, plugin, payload, title = null) {
		return await this.bot.addToHistory(type, plugin, payload, title)
	}

	/**
	 * Get history from storage.
	 * MÉTODO DELEGADO - delega para sessionAdapter
	 * @return void
	 */
	async rebuildHistory() {
		return await this.bot.rebuildHistory()
	}

	/**
	 * Check if session is expired.
	 * MÉTODO DELEGADO - delega para sessionAdapter
	 * @return boolean
	 */
	checkSessionExpired() {
		return this.bot.checkSessionExpired()
	}

	/**
	 * Clear web storage.
	 * MÉTODO DELEGADO - delega para sessionAdapter
	 * @return void
	 */
	clearStorage() {
		return this.bot.clearStorage()
	}

	/**
	 * Renew the session start time.
	 * MÉTODO DELEGADO - delega para sessionAdapter
	 * @param  Integer  time Time in milliseconds
	 * @return void
	 */
	renewSession(time = null) {
		return this.bot.renewSession(time)
	}

	/**
	 * Register bot backend engine.
	 * MIGRADO DO BOT.JS - implementação completa
	 * @param  Object	options	Backend options
	 * @return Void
	 */
	async registerBackend(options) {
		let engine_specific = null
		if (options.engine_specific != undefined)
			engine_specific = options.engine_specific

		if (!options.engine || options.engine.toLowerCase() == 'rasa') {
			let BackendEngine = await import('./Backend/Rasa.js')
			this.bot.backend = new BackendEngine.default(this.bot, {endpoint: options.endpoint, engine_specific: engine_specific})
		} else if (!options.engine || options.engine.toLowerCase() == 'openai') {
			let BackendEngine = await import('./Backend/OpenAI.js')
			this.bot.backend = new BackendEngine.default(this.bot, {endpoint: options.endpoint, engine_specific: engine_specific})
		} else if (!options.engine || options.engine.toLowerCase() == 'insecure-local-ollama') {
			let BackendEngine = await import('./Backend/InsecureLocalOllama.js')
			this.bot.backend = new BackendEngine.default(this.bot, {endpoint: options.endpoint, engine_specific: engine_specific})
		} else if (options.engine.toLowerCase() == 'universal-llm') {
			let BackendEngine = await import('./Backend/UniversalLLM.js')
			this.bot.backend = new BackendEngine.default(this.bot, {endpoint: options.endpoint, engine_specific: engine_specific})
		}

		console.log('★  [•_•] The bot is assembled and ready. [•_•]  ★')
		this.eventEmitter.trigger('core.loaded')
	}

	// ==============================================
	// MÉTODOS DE COMPATIBILIDADE E UTILIDADES
	// ==============================================

	/**
	 * Obtém informações do orchestrator
	 * @return {Object} Informações do orchestrator
	 */
	getOrchestratorInfo() {
		return {
			callingBackend: this.callingBackend,
			loadedUICount: this.loadedUICount,
			redirectInput: this.redirectInput,
			hasBot: !!this.bot,
			botHistoryLength: this.history.length,
			botQueueLength: this.queue.length
		}
	}

	/**
	 * Método para migração gradual - permite acesso direto ao Bot
	 * @return {Bot} Instância do Bot
	 */
	getBot() {
		return this.bot
	}

	/**
	 * Verifica se orchestrator está pronto
	 * @return {boolean} True se pronto
	 */
	isReady() {
		return !!this.bot && !!this.bot.eventEmitter
	}

	/**
	 * Configura redirecionamento de input
	 * @param {string|null} plugin - Plugin para redirecionamento
	 */
	setRedirectInput(plugin) {
		this.redirectInput = plugin
		this.bot.redirectInput = plugin
	}

	/**
	 * Obtém redirecionamento atual
	 * @return {string|null} Plugin de redirecionamento
	 */
	getRedirectInput() {
		return this.redirectInput || this.bot.redirectInput
	}
}
