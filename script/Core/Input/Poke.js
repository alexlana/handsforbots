import Bot from '../../Bot.js'


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
	constructor () {

		this.name = 'poke'
		this.bot = new Bot()

		this.queue = []

		this.register()

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
			return;
		}

		this.queue.forEach(( payload )=>{
			this.bot.sendToBackend( 'poke', payload ).then( (response)=>{
				if ( response.length > 0 )
					this.bot.output( response )
			})
		});
		this.queue = []

	}

	/**
	 * Register input channel.
	 * @return Void
	 */
	register () {

		this.bot.registerInput( this );

	}

	/**
	 * Create triggers.
	 * @param  Object	options	Information about `time`, `event`, `target_type` `target_plugin` and `parameters` to trigger actions.
	 * @return Void
	 */
	ui ( options ) {

		this.bot.UILoaded()

	}

}

