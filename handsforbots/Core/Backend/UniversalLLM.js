/**
 * Universal LLM Backend Connector.
 * Connects to a backend that can access multiple LLM APIs.
 */
import TextHelper from '../../Libs/TextHelper.js';

export default class UniversalLLM {

	/**
	 * Universal LLM Backend constructor.
	 * @param {Object} bot - Bot instance
	 * @param {Object} options - Configuration options
	 * @return void
	 */
	constructor ( bot, options ) {

		this.name = 'universal-llm'
		this.acceptMCP = true
		this.bot = bot

		this.last_user_message = null
		this.last_sender_plugin = null
		this.try_times = 0

		// Backend configuration
		this.endpoint = options.endpoint
		
		// Get parameters from engine_specific if available, otherwise from options
		const engineSpecific = options.engine_specific || {}
		this.provider = engineSpecific.provider || options.provider || 'auto' // auto, openai, anthropic, google, ollama, etc.
		this.model = engineSpecific.model || options.model || 'auto'
		// SECURITY: API keys should NEVER be passed from frontend
		// The backend PHP handles all API key management securely
		this.apiKey = null // Always null - backend handles API keys
		this.sessionId = engineSpecific.sessionId || options.sessionId || null // Will be fetched from backend

		console.log('[✔︎] Bot\'s engine is Universal LLM.')

		this.language = {
			'en-us': {
				'inform_error': 'An error occurred. Try again.',
				'connection_error': 'Connection error. Please check your settings.',
				'api_error': 'API error. Please try again later.',
			},
			'pt-pt': {
				'inform_error': 'Ocorreu um erro, tente novamente.',
				'connection_error': 'Erro de conexão. Verifique suas configurações.',
				'api_error': 'Erro da API. Tente novamente mais tarde.',
			},
			'pt-br': {
				'inform_error': 'Ocorreu um erro, tente novamente.',
				'connection_error': 'Erro de conexão. Verifique suas configurações.',
				'api_error': 'Erro da API. Tente novamente mais tarde.',
			},
		}

	}

	/**
	 * Fetch a session ID from the backend
	 * @return {Promise<string>} Session ID
	 */
	async fetchSessionId() {
		try {
			const response = await fetch(this.endpoint + '/session', {
				method: 'GET',
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json; charset=UTF-8'
				},
				credentials: "omit"
			})

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`)
			}

			const data = await response.json()

			if (data.session_id) {
				return data.session_id
			} else {
				throw new Error('No session_id in response')
			}
		} catch (error) {
			console.error('Error fetching session ID from backend:', error)
			// Fallback to local generation if backend fails
			return this.generateLocalSessionId()
		}
	}

	/**
	 * Generate a local session ID as fallback
	 * @return {string} Session ID
	 */
	generateLocalSessionId() {
		const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
		console.warn('Using fallback local session ID:', sessionId)
		return sessionId
	}

	/**
	 * Ensure we have a valid session ID, fetching from backend if needed
	 * @return {Promise<string>} Session ID
	 */
	async ensureSessionId() {
		if (!this.sessionId) {
			this.sessionId = await this.fetchSessionId()
		}
		return this.sessionId
	}

	/**
	 * Send payload to backend.
	 * @param {boolean|Object} plugin - Plugin that sent the message
	 * @param {Object|string} payload - Information to send to backend
	 * @return {Promise<Array>} Response array
	 */
	async send ( plugin=false, payload ) {

		this.last_sender_plugin = plugin
		this.last_user_message = payload

		// Ensure we have a session ID before sending
		await this.ensureSessionId()

		// Prepare prompt with MCP instructions if available
		const formattedPrompt = this.bot.mcpHelper ? 
			this.bot.mcpHelper.preparePrompt(payload) : payload

		// Universal request format that can be mapped to any LLM API
		const postData = {
			// Request metadata
			request_id: this.generateRequestId(),
			session_id: this.sessionId,
			timestamp: new Date().toISOString(),
			
			// LLM configuration
			provider: this.provider,
			model: this.model,
			// SECURITY: Never send API keys from frontend
			// Backend PHP manages all API keys securely
			
			// Message content
			messages: [{
				role: 'user',
				content: formattedPrompt,
				timestamp: new Date().toISOString()
			}],
			
			// Generation parameters (universal format)
			parameters: {
				max_tokens: 1024,
				temperature: 0.7,
				top_p: 0.9,
				frequency_penalty: 0.0,
				presence_penalty: 0.0,
				stream: false
			},
			
			// Context and tools
			context: {
				system_prompt: this.bot.options.systemPrompt || null,
				conversation_history: this.getConversationHistory(),
				mcp_context: this.bot.mcpHelper.prepareContext()
			},
			
			// Additional options
			options: {
				include_usage: true,
				include_metadata: true,
				response_format: 'text' // text, json, structured
			}
		}
		console.log('postData', postData)

		let response
		let bot_dt = null
		const endpoint_config = {
			method: "POST",
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json; charset=UTF-8',
				'X-Request-ID': postData.request_id,
				'X-Session-ID': this.sessionId
			},
			credentials: "omit",
			body: JSON.stringify( postData ),
		}

		try {
			response = await fetch( this.endpoint, endpoint_config )
			bot_dt = await response.json()
			console.log('Universal LLM Response:', bot_dt);
		} catch ( err ) {
			this.try_times++
			if ( this.try_times <= 3 ) {
				console.warn(`Retry attempt ${this.try_times} for request`)
				return this.send( plugin, payload )
			} else {
				console.error( 'Error when trying to access the endpoint: ' + err )
				return this.handleError('connection_error')
			}
		}
		this.try_times = 0

		// Handle different response formats
		if ( bot_dt == undefined || bot_dt.error || bot_dt.status ) {
			console.debug( 'Backend error: ' + JSON.stringify(bot_dt) )
			return this.handleError('api_error', bot_dt)
		}

		return bot_dt

	}

	/**
	 * Generate a unique request ID
	 * @return {string} Request ID
	 */
	generateRequestId() {
		return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
	}

	/**
	 * Get conversation history for context
	 * @return {Array} Conversation history formatted for LLM
	 */
	getConversationHistory() {
		if (!this.bot || !this.bot.history || this.bot.history.length === 0) {
			return []
		}

		// Get dialog_context_window from engine_specific options (default: 10)
		const contextWindow = this.bot.options?.engine_specific?.dialog_context_window || 10

		// Filter relevant history items (input/output pairs)
		const relevantHistory = this.bot.history.filter(item => {
			// History format: [type, plugin, payload, title]
			// type: 'input' or 'output'
			const [type] = item
			return type === 'input' || type === 'output'
		})

		// Get the most recent items within the context window
		// We want pairs, so we might need more items to get complete conversations
		const recentHistory = relevantHistory.slice(-contextWindow * 2)

		// Convert to LLM format
		const formattedHistory = []
		
		for (const item of recentHistory) {
			const [type, plugin, payload, title] = item
			
			try {
				if (type === 'input') {
					// User input
					let content = ''
					if (typeof payload === 'string') {
						content = payload
					} else if (payload && typeof payload === 'object') {
						// Extract text from input payload
						content = payload.text || payload.message || payload.content || JSON.stringify(payload)
					}
					
					if (content.trim()) {
						formattedHistory.push({
							role: 'user',
							content: content.trim()
						})
					}
				} else if (type === 'output') {
					// Bot output
					let content = ''
					if (typeof payload === 'string') {
						try {
							const parsed = JSON.parse(payload)
							if (Array.isArray(parsed)) {
								// Extract text from bot response array
								content = parsed.map(item => {
									if (typeof item === 'string') return item
									return item.text || item.message || item.content || ''
								}).filter(text => text.trim()).join(' ')
							} else {
								content = parsed.text || parsed.message || parsed.content || payload
							}
						} catch (e) {
							content = payload
						}
					}
					
					if (content.trim()) {
						formattedHistory.push({
							role: 'assistant',
							content: content.trim()
						})
					}
				}
			} catch (error) {
				console.warn('Error processing history item:', error, item)
			}
		}

		// Limit to exact context window size (pairs of user/assistant messages)
		const limitedHistory = formattedHistory.slice(-contextWindow)
		
		return limitedHistory
	}

	/**
	 * Handle errors and return standardized error response
	 * @param {string} errorType - Type of error
	 * @param {Object} errorDetails - Additional error details
	 * @return {Array} Error response
	 */
	handleError(errorType, errorDetails = null) {
		const errorMessage = this.language[this.bot.current_language][errorType] || 
							this.language[this.bot.current_language].inform_error

		const ret = [{
			recipient_id: "error",
			text: errorMessage,
			error_details: errorDetails
		}]

		return ret
	}

	/**
	 * Receive payload from backend.
	 * @param {Object} payload - Information from backend.
	 * @return void
	 */
	receive ( payload ) {
		console.log('Bot received "' + payload + '".')
	}

	/**
	 * Robust UTF-8 text decoder
	 * @param {string} text - Text to decode
	 * @return {string} Decoded text
	 */
	decodeUTF8(text) {
		return TextHelper.decodeUTF8(text);
	}

	/**
	 * Send feedback to LLM about tool execution results
	 * @param {string} feedbackPrompt - Feedback prompt with tool results
	 * @return {Promise<Object>} LLM feedback response
	 */
	async sendFeedback(feedbackPrompt) {
		try {
			// Ensure we have a session ID before sending
			await this.ensureSessionId()
			const postData = {
				request_id: this.generateRequestId(),
				session_id: this.sessionId,
				timestamp: new Date().toISOString(),
				
				provider: this.provider,
				model: this.model,
				api_key: this.apiKey,
				
				messages: [{
					role: 'user',
					content: feedbackPrompt,
					timestamp: new Date().toISOString()
				}],
				
				parameters: {
					max_tokens: 512,
					temperature: 0.3,
					top_p: 0.9,
					stream: false
				},
				
				context: {
					conversation_history: this.getConversationHistory(),
					feedback_mode: true
				},
				
				options: {
					include_usage: false,
					response_format: 'text'
				}
			}

			const endpoint_config = {
				method: "POST",
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json; charset=UTF-8',
					'X-Request-ID': postData.request_id,
					'X-Session-ID': this.sessionId
				},
				credentials: "omit",
				body: JSON.stringify(postData),
			}

			const response = await fetch(this.endpoint, endpoint_config)
			const bot_dt = await response.json()
			
			if (bot_dt && !bot_dt.error && !bot_dt.status) {
				const feedbackText = this.decodeUTF8(bot_dt.response || bot_dt.content || bot_dt.text || '')
				
				return {
					success: true,
					feedback: feedbackText,
					timestamp: new Date().toISOString()
				}
			} else {
				return {
					success: false,
					error: 'Error getting feedback from LLM',
					details: bot_dt
				}
			}
		} catch (error) {
			console.error('Error sending feedback to LLM:', error)
			return {
				success: false,
				error: error.message
			}
		}
	}

	/**
	 * What we want to do when it works.
	 * @param {Object} response - Object of bot actions. Contains `response.to_do` and `response.ret`.
	 * @param {Object} ret - Object of data to return to backend.
	 * @return void
	 */
	actionSuccess ( response ) {
		// Handle successful actions if needed
	}

}
