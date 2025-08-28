/**
 * Contact Ollama.
 */
export default class Ollama {

	/**
	 * Text input constructor.
	 * @return void
	 */
	constructor ( bot, options ) {

		this.name = 'insecure-local-ollama'
		this.acceptMCP = true
		this.bot = bot

		this.last_user_message = null
		this.last_sender_plugin = null

		this.try_times = 0

		this.endpoint = options.endpoint

		console.log('[✔︎] Bot\'s engine is Ollama.')

		this.language = {
			'en-us': {
				'inform_error': 'An error ocurred. Try again.',
			},
			'pt-pt': {
				'inform_error': 'Ocorreu um erro, tente novamente.',
			},
			'pt-br': {
				'inform_error': 'Ocorreu um erro, tente novamente.',
			},
		}

	}

	/**
	 * Prepara o contexto MCP para enviar ao modelo
	 * @return {Object} Contexto MCP
	 */
	prepareMCPContext() {
		const mcpContext = {}
		
		if (this.bot.mcp) {
			if (this.bot.mcp.availableTools && this.bot.mcp.availableTools.length > 0) {
				mcpContext.tools = this.bot.mcp.availableTools.map(tool => ({
					name: tool.name,
					description: tool.description,
					parameters: tool.parameters
				}))
			}
			
			if (this.bot.mcp.availableModels && this.bot.mcp.availableModels.length > 0) {
				mcpContext.available_models = this.bot.mcp.availableModels
			}
			
			if (this.bot.mcp.availableFunctions && this.bot.mcp.availableFunctions.length > 0) {
				mcpContext.available_functions = this.bot.mcp.availableFunctions
			}
		}
		
		return mcpContext
	}

	/**
	 * Send payload to backend.
	 * @param  Object	payload		Information to send to backend.
	 * @return Void
	 */
	async send ( plugin=false, payload ) {

		this.last_sender_plugin = plugin
		this.last_user_message = payload

		// Prepare prompt with MCP instructions if available
		const formattedPrompt = this.bot.mcpHelper ? 
			this.bot.mcpHelper.preparePrompt(payload) : payload

		const postData = {
			'model': this.bot.options.model,
			'prompt': formattedPrompt,
			'stream': false,
			'options': {
				'num_ctx': 2048,
				'num_predict': 1024,
				'temperature': 0.7,
				'top_p': 0.9,
			},
		}

		// Add MCP context if available
		if (this.bot.mcpHelper && this.bot.mcpHelper.hasMCPItems()) {
			const mcpContext = this.bot.mcpHelper.prepareContext()
			Object.assign(postData, mcpContext)
		}

		let response
		let bot_dt = null
		const endpoint_config = {
			method: "POST",
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json; charset=UTF-8',
			},
			credentials: "omit",
			body: JSON.stringify( postData ),
		}
		try {
			response = await fetch( this.endpoint, endpoint_config )
			bot_dt = await response.json()
			console.log('Resposta bruta do Ollama:', bot_dt);
		} catch ( err ) {
			this.try_times++
			if ( this.try_times <= 3 ) {
				return this.send( payload )
			} else {
				console.debug( 'Error when trying to access the endpoint: ' + err )
			}
		}
		this.try_times = 0

		if ( bot_dt == undefined || bot_dt.status != undefined ) {

			if ( bot_dt != undefined && bot_dt.status != undefined )
				console.debug( 'HTTP error when accessing endpoint ('+bot_dt.status+'): ' + bot_dt.description )

			const ret = [
				{
					recipient_id: "error",
					text: this.language[this.bot.current_language].inform_error,
				}
			]

			return ret

		}

		return this.prepareResponse( bot_dt )

	}

	/**
	 * Receive payload from backend.
	 * @param  Object	payload		Information from backend.
	 * @return Void
	 */
	receive ( payload ) {

		console.log('Bot received "' + payload + '".')

	}

	prepareResponse ( bot_dt ) {

		// Função para decodificar texto UTF-8 de forma robusta
		const decodeUTF8 = (text) => {
			if (!text) return '';
			
			// Remove aspas desnecessárias no início e fim
			let cleanText = text.trim();
			
			// Remove aspas duplas no início e fim
			if (cleanText.startsWith('"') && cleanText.endsWith('"')) {
				cleanText = cleanText.slice(1, -1);
			}
			
			// Remove aspas simples no início e fim
			if (cleanText.startsWith("'") && cleanText.endsWith("'")) {
				cleanText = cleanText.slice(1, -1);
			}
			
			// Remove aspas duplas escapadas no início e fim
			if (cleanText.startsWith('\\"') && cleanText.endsWith('\\"')) {
				cleanText = cleanText.slice(2, -2);
			}

			try {
				// Se o texto contém sequências Unicode escapadas (\u00e9, etc.)
				if (cleanText.includes('\\u')) {
					// Remove barras extras que podem estar causando problemas
					const processedText = cleanText.replace(/\\\\/g, '\\');
					return JSON.parse('"' + processedText + '"');
				}
				
				// Se o texto está em formato URI encoded
				if (cleanText.includes('%')) {
					return decodeURIComponent(cleanText);
				}
				
				// Retorna o texto como está se não precisar de decodificação
				return cleanText;
			} catch (error) {
				console.warn('Erro ao decodificar texto:', error);
				// Tenta uma abordagem alternativa para sequências Unicode
				try {
					return cleanText.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
						return String.fromCharCode(parseInt(hex, 16));
					});
				} catch (fallbackError) {
					console.warn('Erro no fallback de decodificação:', fallbackError);
					return cleanText; // Retorna o texto original em caso de erro
				}
			}
		};

		const responseText = decodeUTF8(bot_dt.response || bot_dt.text || '')

		// Use MCP Helper to process response if available
		if (this.bot.mcpHelper && this.bot.mcpHelper.hasMCPItems()) {
			return this.bot.mcpHelper.processResponse(responseText)
		}

		// Return simple response if no MCP
		return [{
			recipient_id: "user",
			text: responseText
		}]
	}

	actionSuccess ( response ) {}

	/**
	 * Send feedback to LLM about tool execution results
	 * @param {string} feedbackPrompt - Feedback prompt with tool results
	 * @return {Promise<Object>} LLM feedback response
	 */
	async sendFeedback(feedbackPrompt) {
		try {
			const postData = {
				'model': this.bot.options.model,
				'prompt': feedbackPrompt,
				'stream': false,
				'options': {
					'num_ctx': 2048,
					'num_predict': 512, // Shorter response for feedback
					'temperature': 0.3, // Lower temperature for more focused feedback
					'top_p': 0.9,
				},
			}

			const endpoint_config = {
				method: "POST",
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json; charset=UTF-8',
				},
				credentials: "omit",
				body: JSON.stringify(postData),
			}

			const response = await fetch(this.endpoint, endpoint_config)
			const bot_dt = await response.json()
			
			if (bot_dt && !bot_dt.status) {
				// Decode response using the same method as main response
				const decodeUTF8 = (text) => {
					if (!text) return '';
					
					let cleanText = text.trim();
					
					if (cleanText.startsWith('"') && cleanText.endsWith('"')) {
						cleanText = cleanText.slice(1, -1);
					}
					
					if (cleanText.startsWith("'") && cleanText.endsWith("'")) {
						cleanText = cleanText.slice(1, -1);
					}
					
					if (cleanText.startsWith('\\"') && cleanText.endsWith('\\"')) {
						cleanText = cleanText.slice(2, -2);
					}

					try {
						if (cleanText.includes('\\u')) {
							const processedText = cleanText.replace(/\\\\/g, '\\');
							return JSON.parse('"' + processedText + '"');
						}
						
						if (cleanText.includes('%')) {
							return decodeURIComponent(cleanText);
						}
						
						return cleanText;
					} catch (error) {
						console.warn('Erro ao decodificar feedback:', error);
						try {
							return cleanText.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
								return String.fromCharCode(parseInt(hex, 16));
							});
						} catch (fallbackError) {
							console.warn('Erro no fallback de decodificação do feedback:', fallbackError);
							return cleanText;
						}
					}
				};

				const feedbackText = decodeUTF8(bot_dt.response || bot_dt.text || '')
				
				return {
					success: true,
					feedback: feedbackText,
					timestamp: new Date().toISOString()
				}
			} else {
				return {
					success: false,
					error: 'Erro ao obter feedback do LLM',
					details: bot_dt
				}
			}
		} catch (error) {
			console.error('Erro ao enviar feedback para LLM:', error)
			return {
				success: false,
				error: error.message
			}
		}
	}

}

