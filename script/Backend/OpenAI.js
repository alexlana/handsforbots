import Bot from '../Bot.js'


/**
 * Contact OpenAI.
 */
export default class OpenAI {


	/**
	 * Text input constructor.
	 * @return void
	 */
	constructor ( options ) {

		this.name = 'openai'
		this.bot = new Bot()

		this.tools = {}
		this.setDefaultTools( options.engine_specific )

		this.assistant_id = null
		this.setAssistant( options.engine_specific )

		this.last_user_message = null
		this.last_sender_plugin = null

		this.try_times = 0

		this.query_type = options.query_type

		this.endpoint = options.endpoint

		console.log('[✔︎] Bot\'s engine is GPT.')

		this.language = {
			'en': {
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
	async send ( plugin=false, payload ) {

		this.last_sender_plugin = plugin
		this.last_user_message = payload

		let postData = null
		if ( payload.tool_calls == undefined ) {

			// this format grant compatibility with completions
			postData = {
				'messages': [{
					'role': 'user',
					'content': payload,
					'tool_choice': 'auto',
					'tools': this.tools,
				}]
			}

			if ( this.assistant_id ) {
				postData.assistant_id = this.assistant_id
			}

		} else {

			postData = {
				'tool_call_id': payload.tool_calls.id,
				'output': payload.output,
			}

		}

		if ( this.assistant_id ) {
			postData.query_type = 'thread'
		} else {
			postData.query_type = 'completions'
		}

		let response
		let bot_dt = null
		let bot_txt = null
		let body = JSON.stringify( postData )
		const endpoint_config = {
			method: 'POST',
			body: body,
			header: {
				'Content-Type': 'application/json'
			}
		}

		try {
			response = await fetch( this.endpoint, endpoint_config )
			if ( !response.ok ) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			bot_dt = await response.json()
		} catch ( err ) {
			console.log( err )
			console.debug( `Error when trying to access the endpoint: ${err}` );
		}
console.log('pre')
console.log(bot_dt)

		if ( bot_dt == undefined || bot_dt.status != undefined || bot_dt.error != undefined ) {

			if ( bot_dt != undefined && bot_dt.status != undefined )
				console.debug( 'HTTP error when accessing endpoint ('+bot_dt.status+'): ' + bot_dt.description );

			else if ( bot_dt != undefined && bot_dt.error != undefined )
				console.debug( 'HTTP error when accessing endpoint ('+bot_dt.error+'): ' + bot_dt.description );

			const ret = [
				{
					recipient_id: "error",
					text: this.language[this.bot.current_language].inform_error,
				}
			]

			return ret

		}

		const ret = this.prepareResponse( bot_dt )

		return ret

	}


	/**
	 * Receive payload from backend.
	 * @param  Object	payload		Information from backend.
	 * @return Void
	 */
	receive ( payload ) {

		console.log('Bot received "' + payload + '".')

	}


	/**
	 * Prepare response according to Bot guidelines.
	 * @param  object   bot_dt Object with Open AI API response.
	 * @return object          Response according to Bot guidelines.
	 */
	prepareResponse ( bot_dt ) {

console.log(bot_dt)

		const recipient_id = 'OpenAI'
		let ret = []

		for ( let message of bot_dt[ 'messages' ] ) {

			if ( message.type == 'simple_message' ) {

				let response = {
					recipient_id: recipient_id,
					text: message.content
				}
				ret.push( response )

			} else if ( message.type == 'tool_calls' && message.command != undefined ) {

				if ( message.command.name == undefined )
					return

				let name_arr = message.command.name.split( '__method__' )
				let name = name_arr.join( '.' )
				let command = {}
				command.action = name
				command.params = message.command.arguments
				command.id = message.id
				let response = {
					recipient_id: recipient_id,
					text: this.bot.action_tag_open + JSON.stringify( command ) + this.bot.action_tag_close
				}
				ret.push( response )

			} else {

				console.log( 'API probably return an incomplete response:' )
				console.log( bot_dt )

				// let response = {
				// 	recipient_id: "error",
				// 	text: this.language[this.bot.current_language].inform_error,
				// }
				// ret.push( response )

			}

		}

		return ret

	}


	/**
	 * Define functions to send to Open AI. See: https://platform.openai.com/docs/guides/function-calling
	 * @param  Object	engine_specific		Specific information to configure the chatbot.
	 * @return Void
	 */
	setDefaultTools ( engine_specific ) {

		if ( engine_specific.tools != undefined )
			this.tools = engine_specific.tools

	}


	/**
	 * Set the agent to talk to.
	 * @param  Object	engine_specific		Specific information to configure the chatbot.
	 * @return Void
	 */
	setAssistant ( engine_specific ) {

		if ( engine_specific.assistant_id != undefined )
			this.assistant_id = engine_specific.assistant_id

	}


	/**
	 * What we want to do when it works.
	 * @param  object   to_do Object of bot actions.
	 * @param  object   ret   Object of data to return to backend.
	 * @return void
	 */
	actionSuccess ( to_do, ret ) {

		if ( ret.standalone != undefined && ret.standalone == true )
			return

	}

}

