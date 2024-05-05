
/**
 * Poke input channel.
 * Call user's attention, sugest topics, change UI... to maintain the 
 * conversation. It's possible to show a message on page load, then define
 * messages to send to user after some time in silence etc
 */
export default class PokeInput {

	/**
	 * Text input constructor.
	 * @return void
	 */
	constructor ( bot ) {

		this.bot = bot

		this.queue = []

		this.bot.eventEmitter.on( 'poke.receiver', ( response )=>{
			this.receiver( response )
		})

		console.log('[✔︎] Bot\'s poke input connected.')

	}

	/**
	 * Receive input payload to create triggers.
	 * @param  Object	payload		Information about `time`, `event`, `target_type` `target_plugin` and `parameters` to trigger actions.
	 * @return Void
	 */
	input ( payload ) {

		if ( this.queue[ this.queue.length-1 ] != payload && payload !== false )
			this.queue.push( payload )

		if ( this.bot.backend == undefined ) {
			setTimeout( (poke, payload)=>{
				poke.input( false )
			}, 300, this, payload )
			return
		}

		this.queue.forEach(( payload )=>{

			this.bot.eventEmitter.trigger( 'core.send_to_backend', [{ 'plugin': 'poke', 'payload': payload, 'trigger': 'poke.receiver' }] )

		})
		this.queue = []

	}

	receiver ( response ) {

		if ( response.length > 0 )
			this.bot.eventEmitter.trigger( 'core.spread_output', [response] )

	}

	/**
	 * Create triggers.
	 * @param  Object	options	Information about `time`, `event`, `target_type` `target_plugin` and `parameters` to trigger actions.
	 * @return Void
	 */
	ui ( options ) {

		this.bot.eventEmitter.trigger( 'core.ui_loaded' )

	}

}

