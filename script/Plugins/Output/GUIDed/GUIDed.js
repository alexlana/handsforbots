import Bot from '../../../Bot.js'

import EventEmitter from '../../../Libs/EventEmitter.js'

export default class GUIDed {

	/**
	 * GUI Ded Tutorial output constructor.
	 * @return void
	 */
	constructor ( options ) {

		this.name = 'GUIDed'

		this.bot = new Bot()
		this.emitter = new EventEmitter()

		this.options = options
		this.sequence = options.sequence
		this.step = 0

		this.language = {
			'en': {
				'btn_next': 'Next >>',
				'btn_previous': '<< Previous',
				'btn_close': 'Close [x]',
				'skip': 'Skip this guide',
			},
			'pt-pt': {
				'btn_next': 'Avançar >>',
				'btn_previous': '<< Voltar',
				'btn_close': 'Fechar [x]',
				'skip': 'Ignorar este guia',
			},
			'pt-br': {
				'btn_next': 'Avançar >>',
				'btn_previous': '<< Voltar',
				'btn_close': 'Fechar [x]',
				'skip': 'Ignorar este guia',
			},
		}

		this.register()

		console.log('[✔︎] GUI Ded Tutorial output connected.')

	}

	/**
	 * Output payload.
	 * @param  Array payload Payload from bot to user.
	 * @return Void
	 */
	async output ( payload ) {}

	/**
	 * Plugin type.
	 * @return String Inform if the plugin is an input or an output adapter.
	 */
	type () {

		return 'output'

	}

	/**
	 * Register output channel.
	 * @return Void
	 */
	register () {

		this.bot.registerOutput( this )

	}

	/**
	 * It don't have an UI, but want to register one.
	 * @return Void
	 */
	async ui ( options ) {

		/**
		 * UI CSS.
		 */
		let ui_css = document.createElement( 'STYLE' )
		ui_css.setAttribute( 'id', 'guided_ui_css' )
		import( /* @vite-ignore */ './GUIDedCSS.js' )
				.then(({ default: GUIDedCSS }) => {
					ui_css.innerHTML = GUIDedCSS
				})
		document.querySelector( 'head' ).append( ui_css )

		this.overlay = document.createElement( 'DIV' )
		this.overlay.setAttribute( 'id', 'guided_overlay' )
		document.querySelector( 'body' ).append( this.overlay )

		if ( this.sequence[ this.step ].type === 'modal' )
			this.modal( this.sequence[ this.step ], this.step, this.sequence.length )
		else
			this.balloon( this.sequence[ this.step ], this.step, this.sequence.length )

		if ( this.options.auto_start ) {

			this.overlay.classList.add( 'show' )

		}

		this.bot.UILoaded()
		console.log( '[✔︎] GUI Ded Tutorial output "UI" added.' )

	}

	navigate ( direction ) {

		if ( direction == 0 ) {

			if ( this.guided_modal )
				this.guided_modal.classList.remove( 'show' )

			if ( this.overlay )
				this.overlay.classList.remove( 'show' )

			if ( this.guided_balloon )
				this.guided_balloon.classList.remove( 'show' )

			return;

		}

		this.step += direction

		if ( this.sequence[ this.step ].type === 'modal' )
			this.modal( this.sequence[ this.step ], this.step, this.sequence.length )
		else
			this.balloon( this.sequence[ this.step ], this.step, this.sequence.length )

	}

	button ( direction, el ) {

		let button = document.createElement( 'BUTTON' )

		button.addEventListener( 'click', ( e )=>{
			this.navigate( direction )
		})

		let btn_text = ''
		if ( direction == 0 ) {
			btn_text = el.btn_close || this.language[this.bot.current_language].btn_close
		} else if ( direction < 0 ) {
			btn_text = el.btn_previous || this.language[this.bot.current_language].btn_previous
		} else if ( direction > 0 ) {
			btn_text = el.btn_next || this.language[this.bot.current_language].btn_next
		}

		button.innerHTML = btn_text

		return button

	}

	skip () {

		let skip_link = document.createElement( 'A' )
		skip_link.classList.add( 'guided_skip' )
		skip_link.setAttribute( 'href', 'javascript:;' )
		skip_link.innerHTML = this.options.skip || this.language[ this.bot.current_language ].skip
		skip_link.addEventListener( 'click', ()=>{ this.navigate(0) } )

		return skip_link

	}

	footerButtons ( message, current, total ) {

		let buttons = document.createElement('DIV');
		buttons.classList.add( 'guided_buttons' )
		if ( current > 0 ) {
			buttons.append( this.button( -1, message ) )
		}
		if ( current < total - 1 ) {
			buttons.append( this.button( 1, message ) )
		} else {
			buttons.append( this.button( 0, message ) )
		}

		return buttons

	}

	modal ( message, current, total ) {

		if ( document.querySelector( '#guided_modal' ) == undefined ) {
			this.guided_modal = document.createElement( 'DIV' )
			this.guided_modal.setAttribute( 'id', 'guided_modal' )
			this.guided_modal.classList.add( 'chat_rounded_box' )
			this.guided_modal.innerHTML = `<h5></h5><div class="chat_inner"></div>`
			document.querySelector( 'body' ).append( this.guided_modal )
		}

		this.guided_modal.classList.remove( 'hide' )
		if ( this.guided_balloon )
			this.guided_balloon.classList.add( 'hide' )

		let text = message.text
		if ( message.text.indexOf( '<p>' ) < 0 )
			text = `<p>${message.text}</p>`

		let inner = this.guided_modal.querySelector( '.chat_inner' )

		this.guided_modal.querySelector( 'h5' ).innerHTML = message.title
		inner.innerHTML = text

		let footer_buttons = this.footerButtons( message, current, total )
		inner.append( footer_buttons )

		let skip_link = this.skip()
		inner.append( skip_link )

		if ( this.options.auto_start ) {

			this.guided_modal.classList.add( 'show' )

		}

	}

	balloon ( message, current, total ) {

		if ( document.querySelector( '#guided_balloon' ) == undefined ) {
			this.guided_balloon = document.createElement( 'DIV' )
			this.guided_balloon.setAttribute( 'id', 'guided_balloon' )
			this.guided_balloon.classList.add( 'chat_rounded_box' )
			this.guided_balloon.innerHTML = `<h5></h5><div class="chat_inner"></div>`
			document.querySelector( 'body' ).append( this.guided_balloon )
		}

		this.guided_balloon.classList.remove( 'hide' )
		if ( this.guided_modal )
			this.guided_modal.classList.add( 'hide' )

		let text = message.text
		if ( message.text.indexOf( '<p>' ) < 0 )
			text = `<p>${message.text}</p>`

		let inner = this.guided_balloon.querySelector( '.chat_inner' )

		this.guided_balloon.querySelector( 'h5' ).innerHTML = message.title
		inner.innerHTML = text

		let footer_buttons = this.footerButtons( message, current, total )
		inner.append( footer_buttons )

		let skip_link = this.skip()
		inner.append( skip_link )


		if ( this.options.auto_start ) {

			this.guided_balloon.classList.add( 'show' )

		}

	}

	waiting () {}

}

