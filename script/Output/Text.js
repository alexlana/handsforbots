import Bot from '../Bot.js'

import { Marked } from 'https://cdn.jsdelivr.net/npm/marked@10.0.0/+esm'


/**
 * Text output channel.
 */
export default class TextOutput {

	/**
	 * Text output constructor.
	 * @return void
	 */
	constructor () {

		this.name = 'text'
		this.container = null
		this.bot = new Bot()
		this.marked = new Marked()

		this.register()

		console.log('[✔︎] Bot\'s text output connected.')

	}

	/**
	 * Output payload.
	 * @param  String payload Text from bot to user.
	 * @return Void
	 */
	async output ( payload, side = 'bot' ) {

		let lazyness = 700 // in miliseconds

		let temp = document.querySelectorAll( '.temp_message' )
		if ( temp != undefined ) {
			temp.forEach( ( obj )=>{
				obj.nextElementSibling.remove()
				obj.remove()
			})
		}

		for ( var i in payload ) {
			setTimeout( ( payload, i )=>{
				if ( payload[i].text ) {
					var chat_message = this.messageWrapper( payload[i].text, side, payload[i].recipient_id )
					chat_message = chat_message
					document.querySelector('#inner_chat_body').append( chat_message )
				}
				if ( payload[i].image != undefined ) {
					var chat_message = this.imageWrapper( payload[i].image )
					document.querySelector('#inner_chat_body').append( chat_message )
				}
				document.querySelector('#inner_chat_body').append( this.listButtons( payload[i].buttons ) )

				this.bot.inputs.text.setChatMarginTop()

			}, i*lazyness, payload, i)
		}

	}

	/**
	 * Register output channel.
	 * @return Void
	 */
	register () {

		this.bot.registerOutput( this );

	}

	/**
	 * Create UI for user output on front end.
	 * @return Void
	 */
	ui ( options ) {

		this.bot.inputs.text.ui( options )

	}

	/**
	 * Message balloon.
	 * @param  String	payload		Text from input to show on front end.
	 * @return HTML		wrapper		HTML of the message balloon.
	 */
	messageWrapper ( payload, side = 'bot', recipient = null ) {

		let wrapper = this.bot.inputs.text.messageWrapper( payload, side, recipient )

		return wrapper

	}

	/**
	 * Image to show.
	 * @param  String	payload		Image source.
	 * @return HTML		wrapper		HTML of the image.
	 */
	imageWrapper ( payload ) {
		const wrapper = document.createElement( 'DIV' )
		wrapper.innerHTML = '<div class="chat_message bot_message img_message"><img src="'+payload+'"></div><div class="chat_div_extra"></div>'
		return wrapper
	}

	/**
	 * Message buttons.
	 * @param  String	text		Text from input to show on button.
	 * @param  String	payload		Intent to send to back end if button is clicked.
	 * @return HTML		wrapper		HTML of the button.
	 */
	buttonWrapper ( title, payload ) {
		const wrapper = document.createElement( 'BUTTON' )
		wrapper.setAttribute( 'payload', payload )
		wrapper.innerHTML = title
		wrapper.addEventListener( 'click', (e)=>{
			this.bot.input( 'text', e.target.getAttribute( 'payload' ), e.target.innerText )
			e.target.parentElement.remove()
		})
		return wrapper
	}

	/**
	 * Liste buttons to answer bot.
	 * @param	Array	buttons				List of buttons.
	 * @return	String 	buttons_wrapper 	HTML of buttons for all possible answers.
	 */
	listButtons ( buttons = null ) {

		if ( !buttons )
			return ''

		let buttons_wrapper = document.createElement('DIV')
		buttons_wrapper.setAttribute( 'class', 'buttons_wrapper' )
		for ( var i in buttons ) {
			buttons_wrapper.append( this.buttonWrapper( buttons[i].title, buttons[i].payload ) )
		}

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

