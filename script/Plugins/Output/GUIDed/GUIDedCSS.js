
const GUIDedCSS = `
		#guided_modal,
		#guided_balloon {
			position: fixed;
			top: 100%;
			bottom: auto;
			left: 50%;
			opacity: 0;
			transform: translate( -50%, -50% );
			max-height: 95vh;
			height: auto;
			z-index: 1001;
			transition: 0.3s opacity ease-in-out, 0.3s top ease-in-out;
		}
		#guided_modal.show,
		#guided_balloon.show {
			top: 50%;
			opacity: 1;
		}
		#guided_modal.show.hide,
		#guided_balloon.show.hide {
			pointer-events: none;
			opacity: 0;
		}
		#guided_modal p {
			font-size: 15px;
		}
		#guided_overlay {
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate( -50%, -50% );
			width: 0;
			height: 0;
			z-index: 1000;
			background: rgba( 0, 0, 0, 0 );
			pointer-events: none;
			transition: 0.1s width 0.4s ease-in-out, 0.1s height 0.4s ease-in-out, 0.4s background ease-in-out;
		}
		#guided_overlay.show {
			width: 100vw;
			height: 100vh;
			background: rgba( 0, 0, 0, 0.7 );
			pointer-events: all;
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
		}
		.guided_skip {
			display: block;
			font-size: 14px;
			text-align: center;
			color: gray;
			text-decoration: none;
		}

	`


export default GUIDedCSS
