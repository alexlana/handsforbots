function VoiceCSS ( bot ) {

	const VoiceCSS = `
		#speech_button {
			display: block!important;
			transition: 0.2s background, 0.2s border, 0.2s opacity;
			cursor:pointer;
			border: none;
			width: 60px;
			height: 60px;
			border-radius: 50%;
			left: 50%;
			bottom: 38px;
			transform: translate(-50%, -50%);
			appearance:none;
			background-color: ${bot.color_schemes[bot.color].primary};
			position:absolute;
			opacity: 0;
			pointer-events: none;
			z-index: 10;
			transition: 0.3s all;
		}
		#speech_button.force_show {
			opacity: 1;
			pointer-events: all;
		}
		.open_chat #speech_button {
			pointer-events: all;
			opacity: 1;
		}
		.keyboard_active #speech_button {
			width: 40px;
			height: 40px;
			left: calc( 100% - 25px );
			transition: 0.3s all 0.1s;
		}
		#speech_button:after {
			content: '';
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate( -50%, -50% );
			width: calc( 100% - 8px );
			height: calc( 100% - 8px );
			border-radius: 50%;
			border: 1px solid white;
			box-shadow: inset 0 0 35px ${bot.color_schemes[bot.color].dark};
		}
		#speech_button svg {
			z-index: 10;
		}
		#speech_button path {
			opacity: 1;
			fill: white;
		}
		.keyboard_active.open_chat #chat_input_wrapper {
			bottom: 0;
			transition: 0.3s all 0.1s;
		}

		#speech_button.listening {
			animation:listening-pulse 2s infinite;
		}
		#speech_button.hear {
			animation:hear-pulse 0.08s infinite;
		}
		@keyframes listening-pulse {
			0% {
				background:#dd0000;
			}
			50% {
				background:#ffaaaa;
			}
			100% {
				background:#dd0000;
			}
		}
		@keyframes hear-pulse {
			0%{
				background:#cccccc;
			}
			50%{
				background:#ffffff;
			}
			100%{
				background:#cccccc;
			}
		}

		#speech_button:hover {
			background:${bot.color_schemes[bot.color].primary_hover};
		}
		#speech_icon {
			pointer-events:none;
			width:20px;
			height:20px;
			position:absolute;
			top:50%;
			left:50%;
			transform:translate(-50%,-50%);
		}
		#speech_icon path {
			translate:0.2s fill;
		}
		#speech_button:hover #speech_icon path, 
		#speech_button.listening #speech_icon path {
			fill:white;
		}
		#speech_tooltip {
			background:${bot.color_schemes[bot.color].primary};
			color:white;
			font-size:1em;
			position:absolute;
			bottom:calc( 100% + 9px );
			left:50%;
			transform: translateX( -50% );
			width:116px;
			padding:3px;
			border-radius:3px;
			opacity:0;
			pointer-events:none;
			transition:0.2s opacity;
		}
		#speech_tooltip:after {
			content:"";
			display:block;
			background:${bot.color_schemes[bot.color].primary};
			position:absolute;
			bottom:-2px;
			left:calc( 50% - 7px );
			height:15px;
			width:15px;
			transform:rotate(45deg);
			z-index:-1;
		}
		.keyboard_active #speech_tooltip {
			left: auto;
			right: 0;
			transform: none;
		}
		.keyboard_active #speech_tooltip:after {
			left: calc( 100% - 28px );
		}
		#speech_button:hover #speech_tooltip,
		#speech_button.listening #speech_tooltip {
			opacity:1;
		}
		#speech_button.bot_speaking {
			transition: 0.2s background, 0.2s border, 0.2s opacity;
			animation:none;
			opacity:0.2;
			pointer-events:none;
			background:transparent;
			border:1px solid #ff0000;
		}
		#speech_button path {
			transition: 0.2s fill, 0.2s stroke, 0.2s stroke-width;
		}
		#speech_button.bot_speaking path {
			transition: 0.2s fill, 0.2s stroke, 0.2s stroke-width;
			fill:#ff0000!important;
		}
		#chat_input.hide::placeholder {
			color:transparent!important;
		}
		#chat_input.hide::-webkit-input-placeholder {
			color:transparent!important;
		}
		#chat_input.hide:-ms-input-placeholder {
			color:transparent!important;
		}
		#speech_partial {
			position:absolute;
			top:0;
			height:100%;
			left:0;
			width:75%;
			font-size:0.9em;
			padding:17px 50px 17px 10px;
			z-index:10;
			pointer-events:none;
			display:flex;
			align-items:flex-end;
			color:#333333;
			overflow:hidden;
		}


		#keyboard_button {
			cursor: pointer;
			border: none;
			appearance: none;
			position: absolute;
			width: 40px;
			height: 40px;
			background-color: ${bot.color_schemes[bot.color].primary};
			border-radius: 50%;
			left: calc( 100% - 40px );
			bottom: 48px;
			transform: translate(-50%, -50%);
			opacity: 0;
			pointer-events: none;
			transition: 0.3s;
		}
		#keyboard_button:hover {
			background-color: ${bot.color_schemes[bot.color].primary_hover};
		}
		.open_chat #keyboard_button {
			pointer-events: all;
			opacity: 1;
		}
		.keyboard_active #keyboard_button {
			opacity: 0;
			pointer-events: none;
		}
		#keyboard_button:after {
			content: '';
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate( -50%, -50% );
			width: calc( 100% - 8px );
			height: calc( 100% - 8px );
			border-radius: 50%;
			border: 1px solid white;
			box-shadow: inset 0 0 35px ${bot.color_schemes[bot.color].dark};
		}
		#keyboard_button svg {
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate( -50%, -50% );
			width: 20px !important;
			height: 20px !important;
			pointer-events: none;
			z-index: 10;
			transition: 0.3s;
		}
		.keyboard_active #keyboard_button svg {
			width: 26px !important;
			height: 26px !important;
		}
		#keyboard_button path {
			opacity: 1;
			fill: white;
		}

		#chat_window.hide_text_ui {
			opacity: 0;
			pointer-events: none;
		}

		`

	return VoiceCSS

}

export default VoiceCSS
