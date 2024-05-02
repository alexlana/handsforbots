import Bot from '../../../Bot.js'

import EventEmitter from '../../../Libs/EventEmitter.js'

import { parse, stringify } from 'yaml'

/**
 * Text input channel.
 */
export default class HexPresentation {

	/**
	 * Text input constructor.
	 * @return void
	 */
	constructor ( bot options ) {

		this.name = 'HexPresentation'
		this.type = 'output'

		this.bot = bot
		this.emitter = new EventEmitter()

		this.options = options

		console.log('[✔︎] Bot\'s presentation module connected.')

	}

	/**
	 * Output payload.
	 * @param  String payload Text from bot to user.
	 * @return Void
	 */
	async output ( payload ) {}

	/**
	 * Create UI for user input on front end.
	 * @return Void
	 */
	async ui ( options ) {
		const css = `
			#presentation_section {
				transition: 0.3s opacity;
			}
			#presentation_section.close {
				opacity: 0;
			}
			.presentation_wrapper {
				position: fixed;
				top: 50%;
				right: 50%;
				transform: translateY( -50% );
				width: 760px;
				max-width: calc( 50vw - 30px );
				height: 150vh;
				padding: 15px;
				padding-top: 35vh;
				padding-bottom: 35vh;
				background-color: rgba( 0, 0, 0, 0.5 );
				z-index: 100;
				transition: 0.6s transform ease-out;
			}
			.close .presentation_wrapper {
				transform: translateY( calc( -50% + 100px ) );
			}
			.presentation_wrapper:before,
			#presentation_highlight:before {
				content: '';
				position: absolute;
				top: 50%;
				right: 0; 
				transform: translate( calc( 50% ), -50% );
				width: 40px;
				height: 40px;
				border-radius: 50%;
				background-color: black;
				z-index: 101;
			}
			#presentation_highlight:before {
				top: 0;
			}
			#presentation_close,
			#highlight_close {
				appearance: none;
				position: absolute;
				top: 50%;
				right: 0;
				transform: translate( calc( 50% ), -50% );
				width: 40px;
				height: 40px;
				border-radius: 50%;
				overflow: hidden;
				border: 2px solid transparent;
				background: #ffffff55;
				text-indent: 100%;
				color: transparent;
				cursor: pointer;
				z-index: 102;
				transition: 0.3s background-color, 0.3s border-color;
			}
			#presentation_close:before,
			#presentation_close:after,
			#highlight_close:before,
			#highlight_close:after {
				content: '';
				position: absolute;
				top: 50%;
				left: 50%;
				height: 4px;
				width: 25px;
				border-radius: 3px;
				background-color: black;
				transform: translate( -50%, -50% ) rotate(45deg);
				transition: 0.3s background-color;
			}
			#presentation_close:after,
			#highlight_close:after {
				transform: translate( -50%, -50% ) rotate(-45deg);
			}
			#presentation_close:hover,
			#highlight_close:hover {
				background-color: transparent;
				border-color: #e84056;
			}
			#presentation_close:hover:before,
			#presentation_close:hover:after,
			#highlight_close:hover:before,
			#highlight_close:hover:after {
				background-color: #e84056;
			}
			#highlight_close {
				top: 0;
			}
			#presentation_highlight {
				transform: translateY( 0 );
				transition: 0.3s transform, 0.3s opacity;
			}
			#presentation_highlight.close {
				opacity: 0;
				transform: translateY( 100px );
			}
			.presentation_inner {
				display: flex;
				justify-content: flex-end;
				flex-wrap: wrap;
				overflow: auto;
				max-height: 100%;
				height: 100%;
			}
			.presentation_item {
				display: block;
				width: 33.33%;
				padding: 15px;
				opacity: 1;
				transform: scale( 1 ) translateY( 0 );
				filter: grayscale( 1 );
				transition: 0.8s opacity, 0.4s transform, 0.4s filter;
			}
			.presentation_item:hover {
				filter: grayscale( 0 );
				transform: scale( 1.07 ) translateY( -4px );
			}
			.close .presentation_item {
				opacity: 0;
				transition: 0.4s opacity;
			}
			.presentation_item img {
				pointer-events: none;
				display: block;
				max-width: 100%;
				height: auto;
				border: 2px solid #ffffff;
				border-radius: 8px;
				transition: 0.8s opacity, 0.4s transform, 0.4s filter, 0.2s border-color;
			}
			.presentation_item:hover img {
				border-color: #e84056;
			}
			#presentation_highlight {
				position: fixed;
				right: 50%;
				top: 50%;
				transform: translateY( -50% );
				width: 38%;
				background: black;
				border: 2px solid #e84056;
				border-radius: 17px;
				box-shadow: 0 0 25px black;
				color: lightgray;
				padding: 30px;
				z-index: 110;
			}
			#presentation_highlight h2 {
				font-size: 18px;
				margin-top: 0;
			}
			#presentation_highlight ul {
				color: var(--azul-claro);
				list-style: none;
				padding-left: 0;
			}
			#presentation_highlight ul b {
				font-weight: 300;
				text-decoration: underline;
			}
			.highlight_visit {
				color: white;
				background: #e84056;
				padding: 1px 8px;
				border-radius: 3px;
				text-transform: lowercase;
				text-decoration: none;
				margin-top: 14px;
				display: inline-block;
				transition: 0.3s background-color;
			}
			.highlight_visit:hover {
				background: #009fe3;
			}
			.presentation_skills {

			}
			.presentation_skills > span {
				display: inline-block;
				margin-right: 10px;
				background: lightgray;
				padding: 0 3px;
				border-radius: 2px;
				font-size: 12px;
				color: black;
			}
			@media (max-width: 991px) {
				.presentation_item {
					width: 50%;
				}
			}
			@media (max-width: 949px) {
				.presentation_wrapper {
					width: calc( 100vw - 50px );
					max-width: 100vw;
					transform: translateX( 50% );
					top: 25px;
					height: calc( 50% - 50px );
				}
				.presentation_item {
					width: 33.33%;
				}
			}
			@media (max-width: 767px) {
				.presentation_wrapper {
					padding: 10px;
				}
				.presentation_item {
					width: 50%;
					padding: 10px;
				}
			}
			@media (max-width: 480px) {
				.presentation_wrapper {
					padding: 5px;
				}
				.presentation_item {
					padding: 5px;
				}
			}
			@media ( pointer: coarse ) {
				.presentation_item {
					filter: grayscale( 0 );
				}
			}
		`
		const style = document.createElement( 'STYLE' )
		style.setAttribute( 'id', 'presentation_css' )
		style.innerHTML = css
		document.querySelector( 'head' ).append( style )

		this.bot.UILoaded()

	}

	async showAll ( params, from_history ) {

		if ( from_history )
			return

		if ( this.options == undefined || this.options.gallery_list == undefined || this.options.gallery_list.length == 0 )
			return false

		let title = ''
		let gallery = ''
		let footer = ''
		if ( params && params.title != undefined && params.title.length > 0 ) {
			title = `
				<h2>${title}</h2>
			`
		}
		var transition_delay = 0
		this.options.gallery_list.forEach(( obj )=>{

			gallery += `
				<a what="${obj}" href="javascript:;" class="presentation_item" style="transition-delay:${transition_delay}s"><img src="${this.options.root}${obj}/preview.png" alt="${obj}"></a>
			`
			transition_delay += 0.1

		})
		const wrapper_template = `
			<div class="presentation_wrapper">
				<button id="presentation_close">Close</button>
				${title}
				<div class="presentation_inner">
					${gallery}
				</div>
				${footer}
			</div>
		`

		const section = document.createElement( 'SECTION' )
		section.setAttribute( 'id', 'presentation_section' )
		section.classList.add( 'close' )
		section.innerHTML = wrapper_template
		document.querySelector( 'body' ).append( section )
		setTimeout( ( section )=>{
			section.classList.remove( 'close' )
		}, 100, section )
		setTimeout( ()=>{
			var presentation_time = 0
			document.querySelectorAll( '.presentation_item' ).forEach(( obj )=>{
				setTimeout( ( obj )=>{ obj.removeAttribute( 'style' ) }, presentation_time, obj )
				presentation_time += 0.2
			})
		}, 200 )

		document.querySelectorAll( '.presentation_item' ).forEach( ( obj )=>{
			obj.addEventListener( 'click', ( e )=>{
				const params = {
					what: e.target.getAttribute( 'what' )
				}
				this.highlight( params )
			} )
		} )

		document.querySelector( '#presentation_close' ).addEventListener( 'click', ()=>{this.closePresentation()} )
		this.emitter.trigger( 'presentation_open' )

		return {success:true,message:"Opened portfolio"}

	}

	closePresentation () {

		const section = document.querySelector( '#presentation_section' )
		section.classList.add( 'close' )
		setTimeout( ( section )=>{ section.remove() }, 400, section )
		this.closeHighlight()
		this.emitter.trigger( 'presentation_close' )

	}

	async highlight ( params, from_history ) {

		if ( from_history )
			return

		let metadata = null
		try {
			await fetch( this.options.root + params.what.toLowerCase() + '/metadata.yml' )
				  .then( response => response.text() )
				  .then( string => {
				  	 metadata = parse( string )
				  } )
			this.useMetadata( metadata )

			this.emitter.trigger( 'presentation_highlight_open', params.what )

			return {success:true,message:"Showed details"}

		} catch (err) {

			console.error(`Can't trigger HexPresentation.highlight: ${err}`)

			return {success:true,message:"Can't show details"}

		}

	}

	useMetadata ( metadata ) {

		const title = `<h2>${metadata.nome}</h2>`
		const descricao = `<p>${metadata.descricao.text}</p>`
		let equipe = ''
		for ( var i in metadata.equipe ) {
			equipe += `
				<li><b>${i}</b>: ${metadata.equipe[i]}</li>
			`
		}
		if ( equipe.length > 0 ) {
			equipe = `<ul>${equipe}</ul>`
		}
		let skills = ''
		if ( metadata.skills.length > 0 ) {
			skills = '<div class="presentation_skills"><span>'+metadata.skills.join( '</span><span>' )+'</span></div>'
		}
		let url = ''
		if ( metadata.url.length > 0 ) {
			url = `<a href="${metadata.url}" target="_blank" class="highlight_visit">Visite o site</a>`
		}

		const inner_html = `
			<button id="highlight_close">Close</button>
			${title}
			${equipe}
			${descricao}
			${skills}
			${url}
		`

		const highlight_wrapper = document.createElement( 'DIV' )
		highlight_wrapper.setAttribute( 'id', 'presentation_highlight' )
		highlight_wrapper.classList.add( 'close' )
		highlight_wrapper.innerHTML = inner_html

		document.querySelector( 'body' ).append( highlight_wrapper )

		document.querySelector( '#highlight_close' ).addEventListener( 'click', ()=>{this.closeHighlight()} )

		setTimeout( ( highlight_wrapper )=>{
			highlight_wrapper.classList.remove( 'close' )
		}, 100, highlight_wrapper )

	}

	closeHighlight () {

		const highlight = document.querySelector( '#presentation_highlight' )
		if ( highlight == null || highlight == undefined )
			return
		highlight.classList.add( 'close' )
		setTimeout( ( highlight )=>{ highlight.remove() }, 400, highlight )
		this.emitter.trigger( 'presentation_highlight_close' )

	}

	waiting () {}

}

