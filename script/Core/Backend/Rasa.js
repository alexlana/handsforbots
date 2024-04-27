import Bot from '../../Bot.js'


/**
 * Contact RASA.
 */
export default class Rasa {

	/**
	 * Text input constructor.
	 * @return void
	 */
	constructor ( options ) {

		this.name = 'rasa'
		this.bot = new Bot()

		this.last_user_message = null
		this.last_sender_plugin = null

		this.try_times = 0

		this.endpoint = options.endpoint

		console.log('[✔︎] Bot\'s engine is RASA.')

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

		const postData = {
			'sender': 'hex',
			'message': payload,
			'metadata': {},
		}

		let response
		let bot_dt = null
		const endpoint_config = {
			method: "POST",
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
				'charset':'UTF-8',
			},
			credentials: "same-origin",
			body: JSON.stringify( postData ),
		}
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

		const ret = this.imagesFirst( bot_dt )

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

	imagesFirst ( bot_dt ) {

		let ret = []
		let img_count = 0
		for ( var i in bot_dt ) {
			if ( bot_dt[i].image == undefined ) {
				ret.push( bot_dt[i] )
			} else {
				ret.splice( img_count, 0, bot_dt[i] )
				img_count++
			}
		}

		return ret

	}

	actionSuccess ( to_do, ret ) {}

}

