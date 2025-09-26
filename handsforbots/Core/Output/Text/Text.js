/**
 * Text output channel.
 */
export default class TextOutput {

	/**
	 * Text output constructor.
	 * @return void
	 */
	constructor ( bot ) {

		this.container = null
		this.bot = bot

		/**
		 * Event listeners
		 */
		this.bot.eventEmitter.on( 'core.calling_backend' , ()=>{
			this.waiting()
		})
		this.bot.eventEmitter.on( 'core.output_ready', ( payload )=>{
			this.output( payload )
		})
		this.bot.eventEmitter.on( 'core.other_window_output', (payload)=>{
			this.insertMessage( payload, 'bot' )
		})

		console.log('[✔︎] Bot\'s text output connected.')

	}

	/**
	 * Output payload.
	 * @param  String payload Text from bot to user.
	 * @return Void
	 */
	async output ( payload, side = 'bot' ) {

		let temp = document.querySelectorAll( '.temp_message' )
		if ( temp != undefined ) {
			temp.forEach( ( obj )=>{
				obj.nextElementSibling.remove()
				obj.remove()
			})
		}

		this.insertMessage( payload, side )

	}

	insertMessage ( payload, side ) {

		let lazyness = 700 // in miliseconds

		for ( var i in payload ) {
			setTimeout( ( payload, i )=>{

				if ( payload[i].text ) {
					// Check if it's inline MCP content
					const html = payload[i].html || null
					var chat_message = this.messageWrapper( payload[i].text, side, payload[i].recipient_id, html )
					chat_message = chat_message
					document.querySelector('#inner_chat_body').append( chat_message )
				}
				if ( payload[i].image != undefined ) {
					var chat_message = this.imageWrapper( payload[i].image )
					document.querySelector('#inner_chat_body').append( chat_message )
				}
				document.querySelector('#inner_chat_body').append( this.listButtons( payload[i].buttons ) )

				this.bot.inputs.Text.setChatMarginTop()

			}, i*lazyness, payload, i)

		}

	}

	/**
	 * Create UI for user output on front end.
	 * @return Void
	 */
	ui ( options ) {

		// this.bot.inputs.Text.ui( options )

		this.bot.eventEmitter.trigger( 'core.ui_loaded' )

	}

	/**
	 * Message balloon.
	 * @param  String	payload		Text from input to show on front end.
	 * @param  String	side		Side of the message.
	 * @param  String	recipient	Recipient type.
	 * @param  String	html		Optional HTML content for inline MCP content.
	 * @return HTML		wrapper		HTML of the message balloon.
	 */
	messageWrapper ( payload, side = 'bot', recipient = null, html = null ) {

		let wrapper = this.bot.inputs.Text.messageWrapper( payload, side, recipient, html )

		return wrapper

	}

	/**
	 * Image to show.
	 * @param  String	payload		Image source.
	 * @return HTML		wrapper		HTML of the image.
	 */
	imageWrapper ( payload ) {

		let wrapper = this.bot.inputs.Text.imageWrapper( payload )
		// const wrapper = document.createElement( 'DIV' )
		// wrapper.innerHTML = '<div class="chat_message bot_message img_message"><img src="'+payload+'"></div><div class="chat_div_extra"></div>'
		return wrapper
	}

	/**
	 * Message buttons.
	 * @param  String	text		Text from input to show on button.
	 * @param  String	payload		Intent to send to back end if button is clicked.
	 * @return HTML		wrapper		HTML of the button.
	 */
	buttonWrapper ( title, payload ) {

		let wrapper = this.bot.inputs.Text.buttonWrapper( title, payload )

		// const wrapper = document.createElement( 'BUTTON' )
		// wrapper.setAttribute( 'payload', payload )
		// wrapper.innerHTML = title
		// wrapper.addEventListener( 'click', (e)=>{
		// 	this.bot.input( 'text', e.target.getAttribute( 'payload' ), e.target.innerText )
		// 	e.target.parentElement.remove()
		// })
		return wrapper
	}

	/**
	 * Liste buttons to answer bot.
	 * @param	Array	buttons				List of buttons.
	 * @return	String 	buttons_wrapper 	HTML of buttons for all possible answers.
	 */
	listButtons ( buttons = null ) {

		let buttons_wrapper = this.bot.inputs.Text.listButtons( buttons )

		// if ( !buttons )
		// 	return ''

		// let buttons_wrapper = document.createElement('DIV')
		// buttons_wrapper.setAttribute( 'class', 'buttons_wrapper' )
		// for ( var i in buttons ) {
		// 	buttons_wrapper.append( this.buttonWrapper( buttons[i].title, buttons[i].payload ) )
		// }

		return buttons_wrapper

	}

	waiting () {

		let payload = [{
			text: '<span>•</span><span>•</span><span>•</span>',
			recipient_id: 'temp',
		}]
		this.output( payload, 'temp' )

	}

}

