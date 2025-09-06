/**
 * Contact Ollama.
 */
import TextHelper from '../../Libs/TextHelper.js';

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
	 * Send payload to backend.
	 * @param  Object	payload		Information to send to backend.
	 * @return Void
	 */
	async send ( plugin=false, payload, promptIsReady = false ) {

		this.last_sender_plugin = plugin
		this.last_user_message = payload

		let finalPrompt = ''
		if ( !promptIsReady ) {

			// Prepare prompt with MCP instructions if available
			const formattedPrompt = this.bot.mcpHelper ? 
				this.bot.mcpHelper.preparePrompt(payload) : payload
			finalPrompt = this.bot.mcpHelper.buildContextualPrompt(formattedPrompt)

		} else {

			finalPrompt = payload

		}

		const postData = {
			'model': this.bot.options.model,
			'prompt': finalPrompt,
			'stream': false,
			'options': {
				'num_ctx': 2048,
				'num_predict': 1024,
				'temperature': 0.7,
				'top_p': 0.9,
			},
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
console.log(finalPrompt)
// console.log('sending...')

		try {
			response = await fetch( this.endpoint, endpoint_config )
			bot_dt = await response.json()
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
			return TextHelper.decodeUTF8(text);
		};

		const responseText = decodeUTF8(bot_dt.response || bot_dt.text || '')

		// Return formatted response for bot (Ollama returns raw text, needs formatting)
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

		this.send(false, feedbackPrompt, true)

		// try {
		// 	const postData = {
		// 		'model': this.bot.options.model,
		// 		'prompt': feedbackPrompt,
		// 		'stream': false,
		// 		'options': {
		// 			'num_ctx': 2048,
		// 			'num_predict': 512, // Shorter response for feedback
		// 			'temperature': 0.3, // Lower temperature for more focused feedback
		// 			'top_p': 0.9,
		// 		},
				
		// 		// Context for feedback (following UniversalLLM pattern)
		// 		context: {
		// 			feedback_mode: true,
		// 			mcp_context: this.bot.mcpHelper.prepareContext()
		// 		}
		// 	}

		// 	const endpoint_config = {
		// 		method: "POST",
		// 		headers: {
		// 			'Accept': 'application/json',
		// 			'Content-Type': 'application/json; charset=UTF-8',
		// 		},
		// 		credentials: "omit",
		// 		body: JSON.stringify(postData),
		// 	}

		// 	const response = await fetch(this.endpoint, endpoint_config)
		// 	const bot_dt = await response.json()
			
		// 	if (bot_dt && !bot_dt.status) {
		// 		const feedbackText = bot_dt.response || bot_dt.text || ''
				
		// 		return {
		// 			success: true,
		// 			feedback: feedbackText,
		// 			timestamp: new Date().toISOString()
		// 		}
		// 	} else {
		// 		return {
		// 			success: false,
		// 			error: 'Erro ao obter feedback do LLM',
		// 			details: bot_dt
		// 		}
		// 	}
		// } catch (error) {
		// 	console.error('Erro ao enviar feedback para LLM:', error)
		// 	return {
		// 		success: false,
		// 		error: error.message
		// 	}
		// }
	}

}

