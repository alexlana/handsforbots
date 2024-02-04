import Bot from '../Bot.js'

import EventEmitter from '../Libs/EventEmitter.js'
import EnvironmentDetection from '../Libs/EnvironmentDetection.js'


/**
 * Voice input channel.
 * Recognize user speech and generate text to send to chat bot.
 */
export default class VoiceInput {

	/**
	 * Text input constructor.
	 * @return void
	 */
	constructor () {

		this.name = 'voice'
		this.bot = new Bot()

		this.eventEmitter = new EventEmitter()
		this.speechRecognitionModule = null
		this.speechRecognition = null
		this.environmentDetection = new EnvironmentDetection()
		this.register()

		this.loadSpeechRecognition()

		this.status = 'not_listening' // options: not_listening, listening, ignoring (microphone is on but the bot is ignoring)
		this.user_set_listening = false
		this.language = {
			'en': {
				tooltip: 'Click to speach. Say short sentences.',
				inform_incompatibility: 'Speech UI removed because of some incompatibility.',
				listening: 'Listening'
			},
			'pt-pt': {
				tooltip: 'Clique para falar. Fale frases curtas.',
				inform_incompatibility: 'O reconhecimento de fala foi removido por incompatibilidade. Você pode digitar ao invés de falar.',
				listening: 'Ouvindo'
			},
			'pt-br': {
				tooltip: 'Clique para falar. Fale frases curtas.',
				inform_incompatibility: 'O reconhecimento de fala foi removido por incompatibilidade. Você pode digitar ao invés de falar.',
				listening: 'Ouvindo'
			},
		}

	}

	isNative () {

		if ( 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window ) {
			return true
		}
		return false

	}

	async loadSpeechRecognition () {

		let wsURL = ''
		if ( this.isNative() ) {
			this.speechRecognitionModule = await import( '../Libs/SpeechRecognition.js' )
		} else {
			wsURL = 'wss://localhost/vosk'
			this.speechRecognitionModule = await import( '../Libs/VoskConnector.js' )
		}
		this.speechRecognition = new this.speechRecognitionModule.default( { language: this.bot.current_language, wsURL: wsURL } )

		console.log('[✔︎] Bot\'s voice input connected.')

	}

	/**
	 * Receive input payload to create triggers.
	 * @param  Object	payload		Information about `time`, `event`, `target_type` `target_plugin` and `parameters` to trigger actions.
	 * @return Void
	 */
	input ( payload ) {

		console.log('Bot received "' + payload + '".')

	}

	/**
	 * Register input channel.
	 * @return Void
	 */
	register () {

		this.bot.registerInput( this )

	}

	/**
	 * Create triggers.
	 * @param  Object	options	Information about `time`, `event`, `target_type` `target_plugin` and `parameters` to trigger actions.
	 * @return Void
	 */
	ui ( options ) {

		this.prioritize_speech = options.prioritize_speech || false

		if ( 
			this.environmentDetection.whatBrowser() != 'Chrome' &&
			this.environmentDetection.whatBrowser() != 'Safari'
			) { // não funciona bem se não for um dos dois
			this.bot.UILoaded()
			return
		}

		if ( ! this.isNative() ) {
			console.log('[✘] UI for speech recognition is not native in your browser. Will try another way.')
		}

		const speech_icon = '<svg version="1.1" id="speech_icon" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 958.673 958.673" style="enable-background:new 0 0 958.673 958.673;" xml:space="preserve"><g><path d="M479.336,618.165L479.336,618.165c98.139,0,177.697-79.557,177.697-177.697V177.697C657.033,79.557,577.476,0,479.337,0h0 C381.197,0,301.64,79.557,301.64,177.697v262.772C301.64,538.607,381.197,618.165,479.336,618.165z"/><path d="M152.554,396.485v43.791c0,44.097,8.646,86.897,25.698,127.211c16.461,38.919,40.017,73.861,70.015,103.859 c29.997,29.998,64.94,53.554,103.859,70.015c20.505,8.673,41.655,15.159,63.289,19.451v99.855 c-42.209,12.594-72.984,51.702-72.984,98.005v0h273.813v0c0-46.303-30.775-85.411-72.984-98.005v-99.855 c21.634-4.292,42.785-10.779,63.29-19.452c38.918-16.461,73.861-40.017,103.858-70.015c29.998-29.997,53.554-64.94,70.015-103.859 c17.052-40.314,25.698-83.115,25.698-127.211v-43.791c0-46.944-38.056-85-85-85v128.791c0,64.582-25.15,125.299-70.816,170.966 c-45.667,45.667-106.384,70.816-170.967,70.816c-64.582,0-125.299-25.15-170.966-70.816 c-45.667-45.667-70.816-106.384-70.816-170.966V311.485C190.61,311.485,152.554,349.541,152.554,396.485z"/></g></svg>';

		let ui_css = document.createElement('STYLE')
		ui_css.setAttribute( 'id', 'speech_css' )
		import( /* @vite-ignore */ './VoiceChatCSS.js' )
				.then(({ default: VoiceCSS }) => {
					ui_css.innerHTML = VoiceCSS
				})
		document.querySelector( 'head' ).append( ui_css )

		let speech_button = document.createElement( 'BUTTON' )
		speech_button.setAttribute( 'id', 'speech_button' )
		speech_button.setAttribute( 'style', 'display:none;' )
		speech_button.innerHTML = speech_icon + '<span id="speech_tooltip">'+this.language[this.bot.current_language].tooltip+'</span>'
		speech_button.addEventListener( 'click', (e)=>{
			document.querySelector('#chat_window').classList.remove('keyboard_active')
			this.listenToUser()
		})

		let keyboard_button = document.createElement( 'BUTTON' )
		keyboard_button.setAttribute( 'id', 'keyboard_button' )
		keyboard_button.innerHTML = '<svg class="svg-icon" style="width: 1em; height: 1em;vertical-align: middle;fill: currentColor;overflow: hidden;" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M264.96 567.04a39.68 39.68 0 0 0-14.08-8.96 42.666667 42.666667 0 0 0-32.426667 0 38.4 38.4 0 0 0-23.04 23.04 42.666667 42.666667 0 1 0 78.506667 0 42.666667 42.666667 0 0 0-8.96-14.08zM576 469.333333h42.666667a42.666667 42.666667 0 0 0 0-85.333333h-42.666667a42.666667 42.666667 0 0 0 0 85.333333z m-170.666667 0h42.666667a42.666667 42.666667 0 0 0 0-85.333333h-42.666667a42.666667 42.666667 0 0 0 0 85.333333z m-128-85.333333h-42.666666a42.666667 42.666667 0 0 0 0 85.333333h42.666666a42.666667 42.666667 0 0 0 0-85.333333zM853.333333 213.333333H170.666667a128 128 0 0 0-128 128v341.333334a128 128 0 0 0 128 128h682.666666a128 128 0 0 0 128-128V341.333333a128 128 0 0 0-128-128z m42.666667 469.333334a42.666667 42.666667 0 0 1-42.666667 42.666666H170.666667a42.666667 42.666667 0 0 1-42.666667-42.666666V341.333333a42.666667 42.666667 0 0 1 42.666667-42.666666h682.666666a42.666667 42.666667 0 0 1 42.666667 42.666666z m-256-128H384a42.666667 42.666667 0 0 0 0 85.333333h256a42.666667 42.666667 0 0 0 0-85.333333z m149.333333-170.666667h-42.666666a42.666667 42.666667 0 0 0 0 85.333333h42.666666a42.666667 42.666667 0 0 0 0-85.333333z m30.293334 183.04a42.666667 42.666667 0 0 0-14.08-8.96 42.666667 42.666667 0 0 0-32.426667 0 39.68 39.68 0 0 0-14.08 8.96 42.666667 42.666667 0 0 0-8.96 14.08 42.666667 42.666667 0 1 0 81.92 16.213333 35.84 35.84 0 0 0-3.413333-16.213333 42.666667 42.666667 0 0 0-8.96-14.08z"  /></svg>'
		keyboard_button.addEventListener( 'click', (e)=>{
			this.stop()
			document.querySelector('#chat_window').classList.add('keyboard_active')
			setTimeout( ()=>{
				document.querySelector('#chat_window input[type="text"]').focus()
			}, 400 )
		})
		document.querySelector('#chat_input').addEventListener( 'focus', (e)=>{
			if ( !document.querySelector('#chat_window').classList.contains( 'keyboard_active' ) ) {
				e.target.blur()
			}
		})
		document.querySelector('#chat_submit').addEventListener( 'focus', (e)=>{
			if ( !document.querySelector('#chat_window').classList.contains( 'keyboard_active' ) ) {
				e.target.blur()
			}
		})

		if ( document.querySelector( '#chat_input_wrapper' ) != undefined ) {
			document.querySelector( '#chat_input_wrapper' ).append( speech_button )
			document.querySelector( '#chat_input_wrapper' ).append( keyboard_button )
			let partial = document.createElement( 'DIV' )
			partial.setAttribute( 'id', 'speech_partial' )
			document.querySelector( '#chat_input_wrapper' ).append( partial )
		} else {
			document.querySelector( 'body' ).append( speech_button )
			document.querySelector( 'body' ).append( keyboard_button )
		}
		this.bot.outputs.voice.eventEmitter.on( 'speaking_start', ()=>{
			// if ( this.speechRecognition.speechRecognition.continuous || !this.isNative() ) {
			if ( this.environmentDetection.whatBrowser() == 'Safari' || !this.isNative() ) {
				this.ignore()
			} else {
				this.stop()
			}
		})
		this.bot.outputs.voice.eventEmitter.on( 'speaking_end', ()=>{
			// if ( this.speechRecognition.speechRecognition.continuous || !this.isNative() ) {
			if ( this.environmentDetection.whatBrowser() == 'Safari' || !this.isNative() ) {
				this.unignore()
			} else if ( this.user_set_listening ) {
				this.start()
			}
		})
		this.bot.outputs.voice.eventEmitter.on( 'speechstart', ()=>{
			document.querySelector( '#speech_button' ).classList.add( 'user_speaking' )
		})
		this.bot.outputs.voice.eventEmitter.on( 'speechend', ()=>{
			document.querySelector( '#speech_button' ).classList.remove( 'user_speaking' )
		})

		if ( !this.prioritize_speech && this.environmentDetection.whatDeviceType() == 'Desktop' ) {
			document.querySelector( '#chat_window' ).classList.add( 'keyboard_active' )
		} else {
			document.querySelector( '#chat_window' ).classList.remove( 'keyboard_active' )
		}

		console.log( '[✔︎] Speech to text UI added.' )

		this.bot.UILoaded()

	}

	removeUi () {

		document.querySelector('#speech_button').remove()
		document.querySelector('#speech_css').remove()

		const payload = [
			{
				recipient_id: "error",
				text: this.language[this.bot.current_language].inform_incompatibility,
			}
		]

		this.bot.output( payload )

		console.log( '[✘] Speech UI removed because of some incompatibility.' )

	}

	async listenToUser () {

		if ( !this.speechRecognitionModule || this.speechRecognitionModule.isPending )
			return

		if ( this.status == 'not_listening' ) {

			this.user_set_listening = true

			this.unignore()

			if ( document.querySelector( '#speech_button' ) != undefined )
				document.querySelector( '#speech_button' ).classList.add( 'listening' )

			/**
			 * Speech recognition events
			 */
			// speech recognition is on
			this.speechRecognition.eventEmitter.on( 'start', (e)=>{
				console.log( 'Start listening' )
				this.eventEmitter.trigger( 'start' )
				document.querySelector( '#speech_tooltip' ).innerText = this.language[ this.bot.current_language ].listening.toUpperCase()
			})
			this.speechRecognition.eventEmitter.on( 'stop', (e)=>{
				console.log( 'Stop listening' )
				this.eventEmitter.trigger( 'stop' )
				document.querySelector( '#speech_tooltip' ).innerText = this.language[ this.bot.current_language ].tooltip
			})
			this.speechRecognition.eventEmitter.on( 'error', (e)=>{
				if ( document.querySelector('#speech_button') == undefined  )
					return
				console.log('error')
				console.log(e)
				this.stopedToListen()
				if ( e != undefined && e.error == 'language-not-supported' && document.querySelector('#speech_button') != undefined ) {
					this.removeUi()
				}
			})

		} else {

			document.querySelector( '#speech_button' ).classList.remove( 'listening' )
			this.user_set_listening = false

			this.stop()

		}

	}

	proccessResults ( data ) {

		if ( this.status == 'ignoring' )
			return

		if ( data != undefined && data.final && this.status == 'listening' ) {
			document.querySelector( '#chat_input' ).classList.remove( 'hide' )
			document.querySelector( '#chat_input' ).value = data.result
			document.querySelector( '#chat_submit' ).click()
			document.querySelector( '#chat_input' ).value = ''
			document.querySelector( '#speech_partial' ).innerText = ''
		} else if ( data != undefined && data.result != undefined && this.user_set_listening && this.status == 'listening' ) {
			document.querySelector( '#chat_input' ).classList.add( 'hide' )
			document.querySelector( '#speech_partial' ).innerText = data.result
		}

	}

	start () {

		if ( !this.speechRecognitionModule || this.speechRecognitionModule.isPending )
			return
		this.speechRecognition.start()
		this.status = 'listening'

	}

	ignore () {

		this.speechRecognition.eventEmitter.off( 'result' )

		if ( !this.isNative() ) {
			this.stop()
		}

		this.status = 'ignoring'
		if ( document.querySelector( '#speech_button' ) != undefined )
			document.querySelector( '#speech_button' ).classList.add( 'bot_speaking' )

	}

	unignore () {

		if ( this.user_set_listening ) {
			if ( !this.isNative() || this.status != 'listening' ) {
				this.start()
			}
			this.status = 'listening'
			document.querySelector( '#speech_button' ).classList.add( 'listening' )
		} else {
			this.status = 'not_listening'
		}

		if ( document.querySelector( '#speech_button' ) != undefined )
			document.querySelector( '#speech_button' ).classList.remove( 'bot_speaking' )

		this.speechRecognition.eventEmitter.on( 'result', ( data )=>{
			this.proccessResults( data )
		})

	}

	stop () {

		document.querySelector( '#chat_input' ).classList.remove( 'hide' )
		document.querySelector( '#speech_partial' ).innerText = ''
		this.speechRecognition.stop()
		setTimeout( ()=>{
			this.status = 'not_listening'
		}, 400 )

	}

	cancel () {

		this.status = 'not_listening'
		this.stop()

	}

	stopedToListen () {

		if ( document.querySelector( '#speech_button' ) != undefined )
			document.querySelector( '#speech_button' ).classList.remove( 'listening' )
		this.status = 'not_listening'

	}

}

