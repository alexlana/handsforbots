import Bot from '../../Bot.js'

import { Marked } from 'https://cdn.jsdelivr.net/npm/marked@10.0.0/+esm'


/**
 * Text input channel.
 */
export default class TextInput {

	/**
	 * Text input constructor.
	 * @return void
	 */
	constructor () {

		this.name = 'text'
		this.container = null
		this.bot = new Bot()

		this.marked = new Marked()

		this.bot.color_schemes = {
			blue: {
				primary: 'rgb(0, 100, 255)',
				primary_hover: 'rgb(0, 81, 205)',
				light: 'rgb(184, 212, 255)',
				dark: 'rgb(53, 76, 164)',
				user: 'rgb(219, 233, 255)',
			},
			green: {
				primary: 'rgb(46, 201, 0)',
				primary_hover: 'rgb(12, 164, 0)',
				light: 'rgb(197, 244, 203)',
				dark: 'rgb(53, 164, 63)',
				user: 'rgb(213, 247, 213)',
			},
			red: {
				primary: 'rgb(201, 0, 0)',
				primary_hover: 'rgb(164, 0, 0)',
				light: 'rgb(255, 224, 212)',
				dark: 'rgb(164, 53, 53)',
				user: 'rgb(255, 224, 212)',
			},
			yellow: {
				primary: 'rgb(218, 190, 0)',
				primary_hover: 'rgb(194, 169, 0)',
				light: 'rgb(247, 240, 188)',
				dark: 'rgb(171, 149, 0)',
				user: 'rgb(247, 240, 188)',
			},
			pink: {
				primary: 'rgb(231, 40, 212)',
				primary_hover: 'rgb(195, 29, 179)',
				light: 'rgb(255, 214, 251)',
				dark: 'rgb(181, 70, 170)',
				user: 'rgb(255, 214, 251)',
			},
			orange: {
				primary: 'rgb(255, 119, 0)',
				primary_hover: 'rgb(230, 107, 0)',
				light: 'rgb(255, 220, 190)',
				dark: 'rgb(209, 114, 31)',
				user: 'rgb(255, 220, 190)',
			},
			purple: {
				primary: 'rgb(177, 0, 255)',
				primary_hover: 'rgb(153, 0, 221)',
				light: 'rgb(240, 205, 255)',
				dark: 'rgb(152, 78, 185)',
				user: 'rgb(240, 205, 255)',
			},
			black: {
				primary: 'rgb(0, 0, 0)',
				primary_hover: 'rgb(40, 40, 40)',
				light: 'rgb(240, 240, 240)',
				dark: 'rgb(150, 150, 150)',
				user: 'rgb(200, 200, 200)',
			},
			gray: {
				primary: 'rgb(180, 180, 180)',
				primary_hover: 'rgb(220, 220, 220)',
				light: 'rgb(240, 240, 240)',
				dark: 'rgb(150, 150, 150)',
				user: 'rgb(200, 200, 200)',
			},
		}
		this.language = {
			'en': {
				'title': 'Come and chat!',
				'bot_name': 'The bot',
				'placeholder': 'Text your message here',
				'send': 'Send',
				'reconnect': 'Reconnect',
				'disconnected': 'The bot is disconnected due to timeout. Previous conversation is lost.',
				'disclaimer': 'Disclaimer',
			},
			'pt-pt': {
				'title': 'Fale com a gente!',
				'bot_name': 'O robô',
				'placeholder': 'Digite aqui sua mensagem',
				'send': 'Enviar',
				'reconnect': 'Reconectar',
				'disconnected': 'O chat foi desconectado por inatividade. A conversa anterior foi perdida.',
				'disclaimer': 'Isenção de responsabilidade',
			},
			'pt-br': {
				'title': 'Fale com a gente!',
				'bot_name': 'O robô',
				'placeholder': 'Digite aqui sua mensagem',
				'send': 'Enviar',
				'reconnect': 'Reconectar',
				'disconnected': 'O chat foi desconectado por inatividade. A conversa anterior foi perdida.',
				'disclaimer': 'Isenção de responsabilidade',
			},
		}

		this.register()

		this.bot.eventEmitter.on('history_cleared', ()=>{
			if ( document.querySelector( '#chat_window' ) ) {
				document.querySelector( '#chat_window' ).classList.add( 'disconnected' )
				document.querySelector( '#chat_window input[type="text"]' ).setAttribute( 'disabled', 'disabled' )
				document.querySelector( '#chat_window input[type="submit"]' ).setAttribute( 'disabled', 'disabled' )
			}
		})

		console.log( '[✔︎] Bot\'s text input connected.' )

	}

	/**
	 * Receive input payload.
	 * @param  String payload 	Text to send to bot and show to user.
	 * @param  String title 	When the title is set, it will be shown to user and the payload will be only send to back end.
	 * @return Void
	 */
	async input ( payload, title = null ) {

		if ( !title )
			title = payload
		if ( title.trim().length == 0 )
			return
		const chat_message = this.messageWrapper( title )
		document.querySelector( '#inner_chat_body' ).append( chat_message )

		this.setChatMarginTop()

		// disable user form while waiting for bot response
		document.querySelector( '#chat_window' ).classList.add( 'waiting' )
		document.querySelector( '#chat_input_wrapper input[type="text"]' ).setAttribute( 'disabled', 'disabled' )
		document.querySelector( '#chat_input_wrapper input[type="submit"]' ).setAttribute( 'disabled', 'disabled' )
		// send data to backend
		this.bot.sendToBackend( 'text', payload ).then( (response)=>{
			// enable user form when bot response is received
			document.querySelector( '#chat_window' ).classList.remove( 'waiting' )
			document.querySelector( '#chat_input_wrapper input[type="text"]' ).removeAttribute( 'disabled' )
			document.querySelector( '#chat_input_wrapper input[type="submit"]' ).removeAttribute( 'disabled' )
			// output bot response
			this.bot.output( response )
			if ( document.querySelector('#chat_window.open_chat').classList.contains( 'keyboard_active' ) ) {
				document.querySelector( 'input[type="text"]' ).focus()
			}
		})

	}

	/**
	 * Register input channel.
	 * @return Void
	 */
	register () {

		this.bot.registerInput( this )

		this.bot.ui_outputs[ 'text' ] = true // text input and text output are interdependants

	}

	/**
	 * Open chat window when loaded
	 * @return void
	 */
	initialOpenChatWindow ( ui_window ) {

		setTimeout( ( ui_window )=>{
			if ( document.querySelector( 'style#text_ui_css' ) != undefined ) {
				ui_window.classList.add( 'open_chat' )
			} else {
				this.initialOpenChatWindow( ui_window )
			}
		}, 250, ui_window )

	}

	/**
	 * Create UI for user input on front end.
	 * @return Void
	 */
	ui ( options ) {

		/**
		 * Placeholder image.
		 */
		const bot_img = 'data:image/png;base64,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'

		this.container = options.container || 'body' // where UI will be added
		this.start_open = options.start_open || false
		this.bot_avatar = (options.bot_avatar != undefined) ? options.bot_avatar : bot_img
		this.bot_name = (options.bot_name != undefined) ? options.bot_name : this.language[this.bot.current_language].bot_name
		this.bot_job = options.bot_job || ''
		this.no_css = options.no_css
		this.bot.color = options.color || 'blue'
		if ( options.color_scheme ) {
			this.bot.color_schemes[ options.color ] = options.color_scheme
		}
		if ( this.bot.color_schemes[this.bot.color] == undefined ) {
			console.warn( 'Can not find the requested color scheme. It will be blue.' )
			this.bot.color = 'blue'
		}
		this.title = options.title || this.language[this.bot.current_language].title
		this.autofocus = options.autofocus || false

		/**
		 * UI CSS.
		 */
		if ( !this.no_css ) {
			let ui_css = document.createElement('STYLE')
			ui_css.setAttribute( 'id', 'text_ui_css' )
			import( /* @vite-ignore */ './TextChatCSS.js' )
					.then(({ default: ChatCSS }) => {
						ui_css.innerHTML = ChatCSS
					})
			document.querySelector( this.container ).append( ui_css )
		}

		/**
		 * UI HTML.
		 */
		let ui_window = document.createElement( 'DIV' )
		ui_window.setAttribute( 'id', 'chat_window' )
		ui_window.classList.add( 'keyboard_active' )
		ui_window.setAttribute( 'style', 'display:none;' )

		let bot_face = ''
		let bot_name = ''
		let bot_job = ''
		let bot_id = ''
		let bot_disclaimer = ''

		if ( this.bot_avatar.length > 0 )
			bot_face = '<div id="bot_face"><img src="' + this.bot_avatar + '"></div>'
		if ( this.bot_job.length > 0 )
			bot_job = '<br><small>'+this.bot_job+'</small>'
		if ( this.bot_name.length > 0 )
			bot_name = '<div id="bot_name"><span>'+this.bot_name+bot_job+'</span></div>'
		if ( bot_face.length > 0 || bot_name.length > 0 )
			bot_id = '<div id="chat_bot_face">\
				'+bot_face+'\
				'+bot_name+'\
			</div>'
		if ( this.bot.disclaimer != undefined ) {
			bot_disclaimer = '<div class="bot_disclaimer" onclick="this.children[0].classList.toggle(\'open\')">' + this.language[this.bot.current_language].disclaimer + '\
			<div class="chat_message bot_disclaimer_message">' + this.bot.disclaimer + '<div class="bot_disclaimer_x"></div></div>\
			</div>'
		}

		ui_window.innerHTML = '<h5>'+this.title+'<button>▲</button></h5>\
			'+bot_id+'\
			<div id="chat_body"><div id="inner_chat_body"><div class="chat_div_extra"></div></div></div>\
			<form id="chat_input_wrapper" autocomplete="off">\
				' + bot_disclaimer + '\
				<input type="text" name="chat_input" id="chat_input" placeholder="'+this.language[this.bot.current_language].placeholder+'"><input type="submit" name="chat_submit" id="chat_submit" value="'+this.language[this.bot.current_language].send+'">\
			</form>\
			<div id="chat_overlay">\
				<span id="chat_disconnected">\
					<p>'+this.language[this.bot.current_language].disconnected+'</p>\
					<button>'+this.language[this.bot.current_language].reconnect+'</button>\
				</span>\
			</div>'
		ui_window.querySelector( 'h5' ).addEventListener( 'click', (e)=>{
			e.stopPropagation()
			e.target.parentElement.classList.toggle( 'open_chat' )
			if ( e.target.parentElement.classList.contains( 'open_chat' ) ) {
				if ( document.querySelector('#chat_window.open_chat').classList.contains( 'keyboard_active' ) ) {
					setTimeout( (e)=>{
						e.target.parentElement.querySelector( 'input[type="text"]' ).focus()
					}, 450, e )
				}
			} else {
				e.target.parentElement.querySelector( 'input[type="text"]' ).blur()
			}
			this.bot.renewSession()
		})
		if ( this.autofocus ) {
			ui_window.addEventListener( 'click', ()=>{
				if ( document.querySelector('#chat_window.open_chat').classList.contains( 'keyboard_active' ) ) {
					ui_window.querySelector( 'input[type="text"]' ).focus()
				}
			})
		}
		ui_window.querySelector( 'form' ).addEventListener( 'submit', (e)=>{
			e.preventDefault()
			const payload = e.target.querySelector( 'input[type="text"]' ).value
			if ( payload.length > 0 ) {
				this.bot.input( 'text', payload )
				e.target.querySelector( 'input[type="text"]' ).value = ''
				this.setChatMarginTop()
			}
		})
		document.querySelector( this.container ).append( ui_window )

		ui_window.querySelector( '#chat_overlay button' ).addEventListener( 'click', (e)=>{
			e.preventDefault()
			document.querySelector( '#chat_window' ).classList.remove( 'disconnected' )
			document.querySelector( '#chat_window input[type="text"]' ).removeAttribute( 'disabled' )
			document.querySelector( '#chat_window input[type="submit"]' ).removeAttribute( 'disabled' )
			document.querySelector( '#inner_chat_body' ).innerHTML = ''
			if ( document.querySelector('#chat_window').classList.contains( 'keyboard_active' ) ) {
				document.querySelector( 'input[type="text"]' ).focus()
			}
			this.bot.renewSession()
		})

		this.rebuildHistory( ui_window )

		if ( this.start_open ) {
			this.initialOpenChatWindow( ui_window )
		}

		if ( options.autofocus ) {
			if ( document.querySelector('#chat_window.open_chat').classList.contains( 'keyboard_active' ) ) {
				document.querySelector('#chat_input').focus()
			}
			document.querySelector('body').addEventListener( 'click', ()=>{
				if ( document.querySelector('#chat_window.open_chat').classList.contains( 'keyboard_active' ) ) {
					document.querySelector('#chat_input').focus()
				}
			} )
		} else {
			document.querySelector('#chat_window').addEventListener( 'click', (e)=>{
				setTimeout( ()=>{ // add a delay, so we can handle some animations before focus
					if ( document.querySelector('#chat_window').classList.contains( 'keyboard_active' ) ) {
						if ( document.querySelector('#chat_window').classList.contains( 'open_chat' ) ) {
							document.querySelector('#chat_input').focus()
						}
					}
				}, 400 )
			} )
		}

		console.log( '[✔︎] Text UI added.' )

		this.bot.UILoaded()

	}

	/**
	 * Message balloon.
	 * @param  String	payload		Text from input to show on front end.
	 * @return HTML		wrapper		HTML of the message balloon.
	 */
	messageWrapper ( payload, side = 'user', recipient = null ) {
		const wrapper = document.createElement( 'DIV' )
		let error_tag = ''
		if ( recipient == 'error' )
			error_tag = 'error'
		payload = payload.replace(/【.*】/, '')
		payload = this.marked.parse( payload )
		wrapper.innerHTML = '<div class="chat_message '+side+'_message '+error_tag+'">'+payload+'</div><div class="chat_div_extra"></div>'
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

	/**
	 * Show previous conversation history on chat.
	 * @param	Object	ui_window	Chat window object.
	 * @return	void
	 */
	rebuildHistory ( ui_window ) {

		for ( var i in this.bot.history ) {
			if ( this.bot.history[i][0] == 'input' ) {
				if ( !this.bot.history[i][3] )
					var title = this.bot.history[i][2]
				else
					var title = this.bot.history[i][3]
				if ( title.trim().length == 0 )
					continue
				if ( this.bot.history[i][1] == 'text' )
					ui_window.querySelector('#inner_chat_body').append( this.messageWrapper( title, 'user' ) )
			} else if ( this.bot.history[i][0] == 'output' ) {
				const output = JSON.parse( this.bot.history[i][2] )
				for ( var j in output ) {
					if ( output[j].image ) {
						ui_window.querySelector('#inner_chat_body').append( this.imageWrapper( output[j].image ) )
					} else {
						if ( !output[j].title ) {
							var title = output[j].text
						} else {
							var title = output[j].title
						}
						if ( title.length > 0 ) {
							ui_window.querySelector('#inner_chat_body').append( this.messageWrapper( title, 'bot', output[j].recipient_id ) )
						}
					}
					if ( output[j].do != undefined ) {
						this.bot.botsCommandsOutput.output( [ output[j] ] )
					}
					if ( i == this.bot.history.length - 1 )
						ui_window.querySelector('#inner_chat_body').append( this.listButtons( output[j].buttons ) )
				}
			}
		}

		if ( this.bot.disclaimer )
			ui_window.querySelector('#inner_chat_body').append( this.messageWrapper( this.bot.disclaimer, 'disclaimer' ) )

		this.setChatMarginTop()

		if ( this.bot.history.length > 0 )
			console.log( '[✔︎] The bot remember past conversation.' )
		else
			console.log( '[✘] The bot don\'t remember past conversations, if any.' )

	}

	setChatMarginTop () {

		let margin_top = document.querySelector( '#chat_body' ).offsetHeight - document.querySelector( '#inner_chat_body' ).offsetHeight - 20
		if ( margin_top < 0 ) {
			document.querySelector( '#inner_chat_body' ).removeAttribute( 'style' )
		} else {
			document.querySelector( '#inner_chat_body' ).setAttribute( 'style', 'margin-top: '+margin_top+'px' )
		}

		setTimeout( ()=>{
			document.querySelector( '#chat_body' ).scrollTo( 0, 1000000 )
		}, 150 )

	}

}

