function GUIDedCSS ( bot ) {

	const GUIDedCSS = `
		#guided_modal,
		#guided_balloon {
			position: fixed;
			top: 100%;
			bottom: auto;
			left: 50%;
			border-radius: 30px;
			padding-left: 23px;
			padding-right: 23px;
			opacity: 0;
			transform: translate( -50%, -50% );
			max-height: 95vh;
			height: auto;
			z-index: 1001;
			overflow: visible;
			pointer-events: none;
			transition: 0.3s opacity ease-in-out, 0.3s top ease-in-out, 0.3s left ease-in-out, 0.3s border-radius ease-in-out;
		}
		#guided_balloon {
			transform: none;
		}
		#guided_balloon:before {
			content: '';
			display: block;
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			border-radius: 30px;
			background: white;
			z-index: -1;
		}

		#guided_balloon:after {
			content: '';
			display: block;
			position: absolute;
			top: 3px;
			left: 50%;
			transform: translate( -50%, -50% ) rotate( 45deg );
			background: white;
			width: 30px;
			height: 30px;
			border-radius: 4px;
			z-index: -2;
			border: 1px solid rgba( 0, 0, 0, 0.1 );
			transition: 0.3s all ease-in-out;
		}
		#guided_balloon[pointer="left-top"] {
			border-top-left-radius: 5px;
		}
		#guided_balloon[pointer="left-top"]:after {
			top: 51px;
			left: -53px;
			transform: translate( 50%, -50% ) rotate( 45deg ) skew( 45deg );
			width: 80px;
			height: 60px;
			border-left: none;
		}
		#guided_balloon[pointer="right-top"] {
			border-top-right-radius: 5px;
		}
		#guided_balloon[pointer="right-top"]:after {
			top: 51px;
			left: calc( 100% - 108px );
			transform: translate( 50%, -50% ) rotate( -45deg ) skew( -45deg );
			width: 80px;
			height: 60px;
		}
		#guided_balloon[pointer="center-bottom"]:after {
			top: calc( 100% - 3px );
			transform: translate( -50%, -50% ) rotate( 45deg );
		}
		#guided_balloon[pointer="right-bottom"] {
			border-bottom-right-radius: 5px;
		}
		#guided_balloon[pointer="right-bottom"]:after {
			top: calc( 100% - 110px );
			left: calc( 100% - 69px );
			transform: translate( 0, 50% ) rotate( 45deg ) skew( 45deg );
			width: 80px;
			height: 60px;
			border-right: none;
		}
		#guided_balloon[pointer="left-bottom"] {
			border-bottom-left-radius: 5px;
		}
		#guided_balloon[pointer="left-bottom"]:after {
			top: calc( 100% - 110px );
			left: -12px;
			transform: translate( 0, 50% ) rotate( -45deg ) skew( -45deg );
			width: 80px;
			height: 60px;
		}

		#guided_modal.show,
		#guided_balloon.show {
			top: 50%;
			opacity: 1;
			pointer-events: all;
		}
		#guided_modal.show.hide,
		#guided_balloon.show.hide {
			pointer-events: none;
			opacity: 0;
		}
		#guided_modal h5,
		#guided_balloon h5 {
			color: ${bot.color_schemes[bot.color].primary};
			background: transparent;
			text-align: left;
			margin-top: -4px;
			font-size: 20px;
			height: auto;
			cursor: auto;
		}
		#guided_modal p,
		#guided_balloon p {
			font-size: 14px;
			color: #333;
		}
		#guided_overlay {
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate( -50%, -50% );
			width: 0;
			height: 0;
			z-index: 998;
			background: rgba( 0, 0, 0, 0 );
			pointer-events: none;
			transition: 0.1s width 0.4s ease-in-out, 0.1s height 0.4s ease-in-out, 0.4s background ease-in-out;
		}
		#guided_overlay.show {
			width: 100vw;
			height: 100vh;
			background: rgba( 0, 0, 0, 0.7 );
			pointer-events: all;
			transition: 0.4s background ease-in-out;
		}
		.guided_buttons {
			display: flex;
			justify-content: center;
			padding-top: 20px;
		}
		.guided_buttons button {
			font-size: 14px !important;
			padding-left: 12px !important;
			padding-right: 12px !important;
			margin-left: 5px !important;
			margin-right: 5px !important;
		}
		.guided_skip {
			display: block;
			font-size: 14px;
			text-align: center;
			color: gray;
			text-decoration: none;
		}

	`

	return GUIDedCSS

}

export default GUIDedCSS
