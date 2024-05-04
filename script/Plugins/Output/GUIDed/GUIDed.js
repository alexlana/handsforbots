import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs'

export default class GUIDed {

	/**
	 * GUI Ded Tutorial output constructor.
	 * @return void
	 */
	constructor ( bot, options ) {

		this.bot = bot

		this.options = options
		this.sequence = options.sequence
		this.step = 0
		this.dom_element = null

		this.language = {
			'en-us': {
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

		/**
		 * To navigate with voice or text.
		 */
		this.vocabuly = {
			'en-us': [
				{ input: 'next', nav_direction: 1 },
				{ input: 'previous', nav_direction: -1 },
				{ input: 'forward', nav_direction: 1 },
				{ input: 'back', nav_direction: -1 },
				{ input: 'skip', nav_direction: 0 },
				{ input: 'start', nav_direction: 1 },
				{ input: 'lets start', nav_direction: 1 },
				{ input: 'skip guide', nav_direction: 0 },
				{ input: 'skip this guide', nav_direction: 0 },
				{ input: 'cancel', nav_direction: 0 },
				{ input: 'enough', nav_direction: 0 },
				{ input: 'understanded', nav_direction: 1 },
				{ input: 'ok', nav_direction: 1 },
				{ input: 'copy', nav_direction: 1 },
				{ input: 'lets go', nav_direction: 1 },
				{ input: 'thank you', nav_direction: 1 },
				{ input: 'thanx', nav_direction: 1 },
				{ input: 'whats next', nav_direction: 1 },
				{ input: 'more', nav_direction: 1 },
			],
			'pt-pt': [
				{ input: 'próximo', nav_direction: 1 },
				{ input: 'anterior', nav_direction: -1 },
				{ input: 'avançar', nav_direction: 1 },
				{ input: 'voltar', nav_direction: -1 },
				{ input: 'pular', nav_direction: 0 },
				{ input: 'iniciar', nav_direction: 1 },
				{ input: 'começar', nav_direction: 1 },
				{ input: 'vamos começar', nav_direction: 1 },
				{ input: 'pular guia', nav_direction: 0 },
				{ input: 'pular este guia', nav_direction: 0 },
				{ input: 'cancelar', nav_direction: 0 },
				{ input: 'chega', nav_direction: 0 },
				{ input: 'entendi', nav_direction: 1 },
				{ input: 'ok', nav_direction: 1 },
				{ input: 'tá bem', nav_direction: 1 },
				{ input: 'bora seguir', nav_direction: 1 },
				{ input: 'segue', nav_direction: 1 },
				{ input: 'obrigado', nav_direction: 1 },
				{ input: 'o que mais', nav_direction: 1 },
				{ input: 'mais', nav_direction: 1 },
			],
			'pt-br': [
				{ input: 'próximo', nav_direction: 1 },
				{ input: 'anterior', nav_direction: -1 },
				{ input: 'avançar', nav_direction: 1 },
				{ input: 'voltar', nav_direction: -1 },
				{ input: 'pular', nav_direction: 0 },
				{ input: 'iniciar', nav_direction: 1 },
				{ input: 'começar', nav_direction: 1 },
				{ input: 'vamos começar', nav_direction: 1 },
				{ input: 'pular guia', nav_direction: 0 },
				{ input: 'pular este guia', nav_direction: 0 },
				{ input: 'cancelar', nav_direction: 0 },
				{ input: 'chega', nav_direction: 0 },
				{ input: 'entendi', nav_direction: 1 },
				{ input: 'ok', nav_direction: 1 },
				{ input: 'tá bem', nav_direction: 1 },
				{ input: 'bora seguir', nav_direction: 1 },
				{ input: 'segue', nav_direction: 1 },
				{ input: 'obrigado', nav_direction: 1 },
				{ input: 'o que mais', nav_direction: 1 },
				{ input: 'mais', nav_direction: 1 },
			],
		}
		this.fuzzy_options = {
			shouldSort: true,
			threshold: 0.8,
			ignoreLocation: true,
			maxPatternLength: 32,
			minMatchCharLength: 1,
			keys: [
				'input',
			],
		}
		this.fuse = new Fuse( this.vocabuly[ this.bot.current_language ], this.fuzzy_options )

		console.log('[✔︎] GUI Ded Tutorial output connected.')

	}

	/**
	 * Output payload.
	 * @param  Array payload Payload from bot to user.
	 * @return Void
	 */
	async output ( payload ) {}

	/**
	 * Intercept user inputs.
	 * @param  String   payload User input.
	 * @return Void
	 */
	redirectedInput ( payload ) {

		this.navigate( this.fuse.search( payload )[0].item.nav_direction )

		return

	}

	/**
	 * Start new guided tutorial.
	 * @param  Object   sequence List of elements to explain.
	 * @return Void
	 */
	newGuide ( sequence ) {

		if ( !this.bot.outputs.BotsCommands.commands_history_loaded )
			return

		this.sequence = sequence
		this.step = 0
		this.dom_element = null

		this.init( true )

	}

	/**
	 * Register user interface.
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
					ui_css.innerHTML = GUIDedCSS( this.bot )
					this.guided_modal.removeAttribute( 'style' )
				})
		document.querySelector( 'head' ).append( ui_css )

		if ( this.overlay == undefined ) {
			this.overlay = document.createElement( 'DIV' )
			this.overlay.setAttribute( 'id', 'guided_overlay' )
			document.querySelector( 'body' ).append( this.overlay )
		}

		this.init( this.options.auto_start )

		this.bot.eventEmitter.trigger( 'core.ui_loaded' )

		console.log( '[✔︎] GUI Ded Tutorial output "UI" added.' )

	}

	/**
	 * Init the presentation.
	 * @return void
	 */
	init ( show=false ) {

		if ( show ) {

			this.options.auto_start = true
			this.overlay.classList.add( 'show' )
			this.bot.redirectInput = 'GUIDed'

		}

		this.nextStep()

	}

	/**
	 * Buttons for navigate through tutorial.
	 * @param  Float  			direction	If `1` forward tutorial, if `-1` rewind, if `0` cancel.
	 * @return Boolean | Void 				Return `false` if direction is `0`, else return `void`
	 */
	navigate ( direction ) {

		this.bot.eventEmitter.trigger( 'core.renew_session' )

		if ( direction == 0 ) {

			if ( this.guided_modal )
				this.guided_modal.classList.remove( 'show' )

			if ( this.overlay )
				this.overlay.classList.remove( 'show' )

			if ( this.guided_balloon )
				this.guided_balloon.classList.remove( 'show' )

			this.bot.redirectInput = false

			return;

		}

		this.step += direction

		this.nextStep()

	}

	/**
	 * Navigate to next or previous step.
	 * @return Void
	 */
	nextStep () {

		if ( this.step >= this.sequence.length ) {
			this.navigate( 0 )
			return
		}

		if ( this.sequence[ this.step ].type === 'modal' ) {
			this.modal( this.sequence[ this.step ], this.step, this.sequence.length )
		} else {
			this.balloon( this.sequence[ this.step ], this.step, this.sequence.length )
		}

		if ( this.options.auto_start ) {

			this.bot.outputs.Voice.output( [ this.sequence[ this.step ] ] )

		}

	}

	/**
	 * Create HTML buttons to navigate.
	 * @param  Float    direction If `1` forward tutorial, if `-1` rewind, if `0` cancel.
	 * @param  Object	el        Message and options to configure the button.
	 * @return Object             DOM button object.
	 */
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

	/**
	 * Link to cancel the tutorial.
	 * @return Object  HTML `<a>` object containing the link to cancel the tutorial.
	 */
	skip () {

		let skip_link = document.createElement( 'A' )
		skip_link.classList.add( 'guided_skip' )
		skip_link.setAttribute( 'href', 'javascript:;' )
		skip_link.innerHTML = this.options.skip || this.language[ this.bot.current_language ].skip
		skip_link.addEventListener( 'click', ()=>{ this.navigate(0) } )

		return skip_link

	}

	/**
	 * The footer containing the navigation buttons.
	 * @param  Object   message Message and message options to create the buttons.
	 * @param  Integer  current Current guide step.
	 * @param  Integer  total   Total guide steps.
	 * @return Object           DOM object containing the buttons.
	 */
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

	/**
	 * Create and update modal.
	 * @param  Object   message Message and message options.
	 * @param  Integer  current Current guide step.
	 * @param  Integer  total   Total guide steps.
	 * @return Void
	 */
	modal ( message, current, total ) {

		if ( document.querySelector( '#guided_modal' ) == undefined ) {
			this.guided_modal = document.createElement( 'DIV' )
			this.guided_modal.setAttribute( 'id', 'guided_modal' )
			this.guided_modal.setAttribute( 'style', 'display:none;' )
			this.guided_modal.classList.add( 'chat_rounded_box' )
			this.guided_modal.innerHTML = `<h5></h5><div class="chat_inner"></div>`
			document.querySelector( 'body' ).append( this.guided_modal )
		}

		this.guided_modal.classList.remove( 'hide' )
		if ( this.guided_balloon )
			this.guided_balloon.classList.add( 'hide' )

		this.overlay.removeAttribute( 'style' )

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

	/**
	 * Create and update balloons.
	 * @param  Object   message Message and message options.
	 * @param  Integer  current Current guide step.
	 * @param  Integer  total   Total guide steps.
	 * @return Void
	 */
	balloon ( message, current, total ) {

		if ( document.querySelector( '#guided_balloon' ) == undefined ) {
			this.guided_balloon = document.createElement( 'DIV' )
			this.guided_balloon.setAttribute( 'id', 'guided_balloon' )
			this.guided_balloon.classList.add( 'chat_rounded_box' )
			this.guided_balloon.innerHTML = `<h5></h5><div class="chat_inner"></div>`
			document.querySelector( 'body' ).append( this.guided_balloon )
			window.addEventListener( 'resize', ()=>{ this.balloonPosition() } )
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

		this.dom_element = message.dom_element
		this.balloonPosition();

	}

	/**
	 * Moves the balloon close to the highlighted GUI element.
	 * @return Void
	 */
	balloonPosition () {

		let window_width = window.innerWidth
		let window_height = window.innerHeight

		let focus = document.querySelector( this.dom_element );
		let focus_bounds = focus.getBoundingClientRect()

		let balloon_bounds = this.guided_balloon.getBoundingClientRect()

		let pointer = []
		pointer[0] = 'center'
		pointer[1] = 'top'

		let x = focus_bounds.x + focus_bounds.width / 2 - balloon_bounds.width / 2
		if ( x < 0 ) {
			x += balloon_bounds.width / 2
			pointer[0] = 'left'
		}
		if ( x + balloon_bounds.width > window_width ) {
			x -= balloon_bounds.width / 2
			pointer[0] = 'right'
		}

		let y = focus_bounds.y + focus_bounds.height + 25
		if ( y + balloon_bounds.height > window_height ) {
			y = focus_bounds.y - balloon_bounds.height - 25
			pointer[1] = 'bottom'
		}

		this.guided_balloon.setAttribute( 'pointer', pointer.join( '-' ) )

		this.guided_balloon.style.left = x + 'px'
		this.guided_balloon.style.top = y + 'px'

		this.mask( focus_bounds )

	}

	/**
	 * Creates a mask on the overlay to highlight a GUI element.
	 * @return Void
	 */
	mask ( focus_bounds ) {

		let centro_x = focus_bounds.x + focus_bounds.width / 2
		let centro_y = focus_bounds.y + focus_bounds.height / 2
		let raio = focus_bounds.width
		if ( raio < focus_bounds.height )
			raio = focus_bounds.height
		raio *= 0.7
		let radial = `radial-gradient( circle at ${centro_x}px ${centro_y}px, rgba(0, 0, 0, 0) ${raio}px, black ${raio}px )`

		let css = `-webkit-mask-image:${radial};mask-image:${radial};`
		this.overlay.setAttribute( 'style', css )

	}

	/**
	 * What to do while waiting back end response.
	 * @return Void
	 */
	waiting () {}

}

