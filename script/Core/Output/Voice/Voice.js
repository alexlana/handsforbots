import EasySpeech from '../../../Libs/EasySpeech.es5.js'
import { Marked } from 'https://cdn.jsdelivr.net/npm/marked@10.0.0/+esm'
import EnvironmentDetection from '../../../Libs/EnvironmentDetection.js'


/**
 * Text input channel.
 */
export default class VoiceOutput {


	/**
	 * Text input constructor.
	 * @return void
	 */
	constructor ( bot ) {

		this.bot = bot

		this.voice = null
		this.mute = null
		this.volume = 1
		this.speaking = false
		this.voice_loaded = false
		this.options = null
		this.language = {
			'en-us': {
				unmute: 'Voice on.',
			},
			'pt-pt': {
				unmute: 'Voz ativa.',
			},
			'pt-br': {
				unmute: 'Voz ativa.',
			},
		}
		this.mobListener = ()=>{ this.initSpeech( true ) }

		this.marked = new Marked()
		this.environmentDetection = new EnvironmentDetection()

		this.bot.eventEmitter.on( 'history_cleared', ()=>{
			this.bot.botStorage.removeItem( 'mute' )
			this.mute = true
			if ( document.querySelector( '#chat_voice_toggle' ) != undefined )
				document.querySelector( '#chat_voice_toggle' ).classList.add( 'voice-off' )
		})

		/**
		 * Event listeners
		 */
		this.bot.eventEmitter.on( 'core.output_ready', ( payload )=>{
			this.output( payload )
		})

		console.log('[✔︎] Bot\'s voice output connected.')

	}


	/**
	 * Output payload.
	 * @param  String payload Text from bot to user.
	 * @return Void
	 */
	async output ( payload ) {

		if ( this.mute )
			return

		if ( !this.voice_loaded ) {
			setTimeout( ( payload )=>{ this.output( payload ); }, 300, payload )
			return
		}

		this.EasySpeech.cancel()

		let final_payload = ''

		for ( var i in payload ) {

			if ( !payload[i].text )
				continue

			payload[i].text = payload[i].text.replace(/【.*】/, '')
			final_payload += ' ' + this.marked.parse( payload[i].text )

		}

		if ( !this.mute ) {
			this.speaking = true
			this.bot.eventEmitter.trigger('speaking_start')
		}

		final_payload = final_payload.replace(/(<([^>]+)>)/gi, "")

		const spkng = await this.EasySpeech.speak({
			text: final_payload,
			voice: this.voice,
			pitch: 1,
			rate: 1.1,
			volume: this.volume,
		})
		.then( ()=>{
			this.speaking = false
			this.bot.eventEmitter.trigger('speaking_end')
		})

	}


	/**
	 * Initialize the speech recognition.
	 * @param  Boolean say_no_text   Inform if we want the bot to activate speech, but say nothing. It is for iOS to work
	 * @return void
	 */
	async initSpeech ( say_no_text = false ) {

		let activated_payload = [ { text: this.language[ this.bot.current_language ].unmute } ]
		if ( say_no_text && this.EasySpeech == undefined )
			activated_payload = [{text:' '}]

		if ( this.EasySpeech != undefined ) {
			this.output( activated_payload )
			return
		}

		this.EasySpeech = EasySpeech

		await this.EasySpeech.init({ maxTimeout: 5000, interval: 250 })
			.then(

				()=>{
					for ( var i = 0; i < this.EasySpeech.voices().length ; i++ ) {
						if ( this.options.name != undefined ) {
							if ( this.EasySpeech.voices()[i].name.toLowerCase() === this.options.name.toLowerCase() ) {
								if ( this.EasySpeech.voices()[i].lang.toLowerCase() === this.bot.current_language.toLowerCase() ) {
									this.voice = this.EasySpeech.voices()[i]
									break
								}
							}
						} else if ( this.bot.current_language != undefined ) {
							if ( this.EasySpeech.voices()[i].lang.toLowerCase() === this.bot.current_language.toLowerCase() ) {
								this.voice = this.EasySpeech.voices()[i]
								break
							}
						}
					}

					this.output( activated_payload )

				}

			)
			.catch(e => console.error(e))

		this.voice_loaded = true

		document.querySelector( 'body' ).removeEventListener( 'click', this.mobListener )

	}


	/**
	 * Create UI for user input on front end.
	 * @return Void
	 */
	async ui ( options ) {

		this.options = options
		this.mute = this.bot.botStorage.getItem( 'mute' )
		if ( this.mute !== false )
			this.mute = true

		if ( !this.mute && this.environmentDetection.whatDeviceType() == 'Desktop' ) {

			this.initSpeech( true )

		}

		const button_icons = '<svg id="sound-on" width="100%" height="100%" viewBox="0 0 40 40" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;"><path d="M12.35,14.118L18.633,9.409C19.494,8.754 20.206,9.122 20.206,10.202L20.206,29.819C20.206,30.91 19.506,31.266 18.633,30.611L12.35,25.902L12.35,25.891L8.422,25.891C7.343,25.891 6.458,25.006 6.458,23.95L6.458,16.059C6.458,14.991 7.331,14.118 8.422,14.118L12.35,14.118ZM29.682,29.371C34.862,24.191 34.862,15.806 29.682,10.638C29.107,10.064 28.177,10.064 27.603,10.638C27.029,11.212 27.029,12.143 27.603,12.717C31.623,16.737 31.623,23.26 27.603,27.292C27.029,27.866 27.029,28.796 27.603,29.371C28.177,29.945 29.107,29.956 29.682,29.371ZM25.524,25.213C28.395,22.342 28.395,17.679 25.524,14.807C24.95,14.233 24.019,14.233 23.445,14.807C22.871,15.381 22.871,16.312 23.445,16.886C25.168,18.609 25.168,21.4 23.445,23.134C22.871,23.708 22.871,24.639 23.445,25.213C24.008,25.787 24.95,25.787 25.524,25.213Z" style="fill:white;fill-rule:nonzero;"/></svg><svg id="sound-off" width="100%" height="100%" viewBox="0 0 40 40" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;"><path d="M12.35,14.118L18.633,9.409C19.494,8.754 20.206,9.122 20.206,10.202L20.206,29.819C20.206,30.91 19.506,31.266 18.633,30.611L12.35,25.902L12.35,25.891L8.422,25.891C7.343,25.891 6.458,25.006 6.458,23.95L6.458,16.059C6.458,14.991 7.331,14.118 8.422,14.118L12.35,14.118Z" style="fill:white;fill-rule:nonzero;"/><g transform="matrix(1,0,0,1,1.09442,0)"><path d="M26.112,17.945L23.847,15.68C23.266,15.099 22.324,15.099 21.743,15.68C21.743,15.68 21.743,15.68 21.743,15.68C21.162,16.261 21.162,17.204 21.743,17.785L24.007,20.049L21.743,22.313C21.162,22.895 21.162,23.837 21.743,24.418C21.743,24.418 21.743,24.418 21.743,24.418C22.324,24.999 23.266,24.999 23.847,24.418L26.112,22.153L28.376,24.418C28.957,24.999 29.899,24.999 30.48,24.418C30.48,24.418 30.48,24.418 30.48,24.418C31.061,23.837 31.061,22.895 30.48,22.313L28.216,20.049L30.48,17.785C31.061,17.204 31.061,16.261 30.48,15.68C30.48,15.68 30.48,15.68 30.48,15.68C29.899,15.099 28.957,15.099 28.376,15.68L26.112,17.945Z" style="fill:white;"/></g></svg>'

		let button = document.createElement('BUTTON')
		button.setAttribute( 'id', 'chat_voice_toggle' )
		button.innerHTML = button_icons
		button.addEventListener( 'click', (e)=>{
			e.target.classList.toggle('voice-off')
			if ( e.target.classList.contains('voice-off') ) {
				this.mute = true
				this.EasySpeech.cancel()
			} else {
				this.mute = false
				this.initSpeech()
			}
			this.bot.botStorage.setItem( 'mute', this.mute, error => { console.error(error) })
		})

		if ( this.mute )
			button.classList.add('voice-off')

		if ( document.querySelector( '#chat_window' ) != undefined )
			document.querySelector( '#chat_window' ).append( button )
		else
			document.querySelector( 'body' ).append( button )

		let ui_css = document.createElement('STYLE')
		ui_css.innerHTML = `
			#chat_voice_toggle {
				transition:0.2s background;
				cursor:pointer;
				position:absolute;
				top:47px;
				right:10px;
				z-index:20;
				appearance:none;
				border:none;
				border-radius:5px;
				height:40px;
				width:40px;
				background:${this.bot.color_schemes[this.bot.color].primary};
			}
			#chat_voice_toggle #sound-on {
				display:none;
				pointer-events:none;
			}
			#chat_voice_toggle #sound-off {
				display:block;
				pointer-events:none;
			}
			#chat_voice_toggle.voice-off #sound-on {
				display:block;
			}
			#chat_voice_toggle.voice-off #sound-off {
				display:none;
			}
			#chat_voice_toggle:hover {
				background:${this.bot.color_schemes[this.bot.color].primary_hover};
			}
			#chat_bot_face {
				padding-right:60px;
			}
		`
		document.querySelector( 'head' ).append( ui_css )

		console.log( '[✔︎] Voice output UI added.' )

		this.bot.eventEmitter.trigger( 'core.ui_loaded' )

		if ( !this.mute && this.environmentDetection.whatDeviceType() == 'Mobile' )
			document.querySelector( 'body' ).addEventListener( 'click', this.mobListener )

	}

	waiting () {}

}

