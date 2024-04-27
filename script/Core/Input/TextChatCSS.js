import Bot from '../../Bot.js'

let bot = new Bot()


const ChatCSS = `
		.chat_rounded_box {
			display: block !important;
			font-family:sans-serif;
			box-sizing:border-box;
			width:300px;
			max-width:calc( 100% - 40px );
			position:fixed;
			bottom:10px;
			right:20px;
			padding:18px 20px;
			background:white;
			border-radius: 40px;
			box-shadow:0 3px 8px rgba(0,0,0,0.3);
			overflow:hidden;
			font-size:16px;
			max-height:38px;
			z-index: 999;
			transition: 0.3s max-height, 0.3s border-radius;
		}
		.chat_rounded_box.open_chat {
			max-height:500px;
		}
		.chat_rounded_box.keyboard_active.open_chat {
			border-bottom-left-radius: 20px;
			border-bottom-right-radius: 20px;
		}
		.chat_rounded_box * {
			box-sizing:border-box;
			line-height:1.3;
			letter-spacing: 0;
		}
		.chat_rounded_box ul,
		.chat_rounded_box ol {
			padding-left: 20px !important;
			list-style-position: outside !important;
			margin: 0 !important;
		}
		.chat_rounded_box ul li,
		.chat_rounded_box ol li {
			margin: 6px 0 !important;
		}
		#chat_body {
			scroll-behavior:smooth;
			height:374px;
			max-height:calc( 96vh - 110px );
			position:relative;
			margin:0 -20px;
			padding:0 20px;
			overflow:scroll;
		}
		.inner_chat {
			padding-bottom: 80px;
		}
		.inner_chat a {
			text-decoration: none;
			padding: 0 5px;
			color:white;
			border-radius: 2px;
			background-color:${bot.color_schemes[bot.color].dark};
			overflow-wrap: break-word;
			transition: 0.3s background-color, 0.3s color;
		}
		.inner_chat a:hover {
			color:black;
			background-color:white;
		}
		.chat_rounded_box h5 {
			position:relative;
			color:white;
			background:${bot.color_schemes[bot.color].primary};
			margin:-18px -20px 0;
			padding:10px 20px;
			cursor:pointer;
			font-size:0.9em;
			z-index:10;
			height:38px;
			text-align: center;
			transition:0.2s background;
		}
		.chat_rounded_box h5:hover {
			background:${bot.color_schemes[bot.color].primary_hover};
		}
		.chat_rounded_box h5 button {
			pointer-events:none;
			position:absolute;
			top:0;
			right:0;
			display:flex;
			align-items:center;
			justify-content:center;
			height:37px;
			width:40px;
			appearance:none;
			background:transparent;
			color:white;
			border:none;
			font-size:0.75em;
			font-weight:bold;
			box-shadow: none;
			transition: 0.3s transform ease-in-out, 0.3s right ease-in-out;
		}
		.chat_rounded_box.open_chat h5 button {
			transform: rotate(180deg);
			right: 8px;
		}
		.chat_rounded_box form {
			display:flex;
			padding:0;
			margin:0 -20px;
			position: absolute;
			bottom: -60PX;
			left: 20px;
			width: 100%;
			z-index: 300;
			transition: 0.3s;
		}
		.chat_rounded_box.keyboard_active.open_chat form {
			bottom: 0;
		}
		.chat_rounded_box.waiting form {
			pointer-events:none;
		}
		.chat_rounded_box input {
			appearance:none;
			font-size:0.9em;
			padding:17px 10px;
			border:none;
			outline:none;
		}
		.chat_rounded_box input[type="text"] {
			/*box-shadow:inset 0 0 5px rgba(0,0,0,0.4);*/
			border-top-right-radius: 10px;
			color:#333333;
			width:72%;
			padding-left: 15px;
			color: black;
			background:${bot.color_schemes[bot.color].light};
		}
		.chat_rounded_box input[type="text"]:focus {
			box-shadow: none;
			border: none;
			outline: none;
		}
		.chat_rounded_box input[type="text"]::placeholder {
			color:${bot.color_schemes[bot.color].primary};
			opacity:0.5;
		}
		.chat_rounded_box input[type="text"]::-webkit-input-placeholder {
			color:${bot.color_schemes[bot.color].primary};
			opacity:0.5;
		}
		.chat_rounded_box input[type="text"]:-ms-input-placeholder {
			color:${bot.color_schemes[bot.color].primary};
			opacity:0.5;
		}
		.chat_rounded_box input[type="submit"] {
			cursor:pointer;
			width:28%;
			padding-right: 15px;
			text-transform:uppercase;
			color:${bot.color_schemes[bot.color].dark};
			background:${bot.color_schemes[bot.color].light};
			border-top-left-radius: 10px;
			transition:0.4s all;
			letter-space:0.9;
		}
		.chat_rounded_box input[type="submit"]:hover {
			text-shadow:0 0 2px rgba(0,0,0,0.7);
			color: white;
			background:${bot.color_schemes[bot.color].dark};
		}
		.chat_rounded_box input[type="submit"]:active {
			color:${bot.color_schemes[bot.color].dark};
			background:${bot.color_schemes[bot.color].light};
			text-shadow: 0 0 0 transparent;
			transition:0.2s;
		}
		.chat_rounded_box:not(.keyboard_active) input[type="text"],
		.chat_rounded_box:not(.keyboard_active) input[type="submit"] {
			user-select: none;
			-webkit-user-select: none;
			pointer-events: none;
		}
		.chat_message {
			position:relative;
			border-radius:6px;
			background:#eee;
			max-width:80%;
			min-width:20px;
			in-height:32px;
			padding:0 8px;
			font-size:0.9em;
			color:black;
			float:left;
			clear:both;
		}
		.chat_message p {
			margin: 6px 0 !important;
		}
		.chat_div_extra {
			display:block!important;
			height:20px;
			clear:both;
		}
		.chat_message:after {
			content:"";
			display:block;
			width:10px;
			height:16px;
			position:absolute;
			top:50%;
			transform:translateY(-50%);
			left:-8px;
			background:#eee;
			clip-path:polygon(0 50%, 100% 0, 100% 100%);
		}
		.chat_message.error {
			background:#ffdddd;
			color:#660000
		}
		.chat_message.error:after {
			background:#ffdddd
		}
		.temp_message {
			position: relative;
			min-width: 40px;
			min-height: 30px;
		}
		.temp_message p {
			text-align: center;
			padding-right: 4px;
			padding-top: 1px;
		}
		.temp_message span {
			opacity: 0;
			font-size: 1.2em;
			letter-spacing: 0.2em;
			display: inline-block;
			animation: waiting_bot 1s ease-in-out infinite;
			animation-delay: 0s;
		}
		.temp_message span:nth-child(2) {
			animation-delay: 0.2s;
		}
		.temp_message span:nth-child(3) {
			animation-delay: 0.3s;
			margin-right: -0.2em;
		}
		@keyframes waiting_bot {
			0% {
				opacity: 0;
			}
			50% {
				opacity: 1;
			}
			90% {
				opacity: 0;
			}
			100% {
				opacity: 0;
			}
		}
		.user_message {
			text-align:right;
			background:${bot.color_schemes[bot.color].user};
			float:right;
		}
		.user_message:after {
			left:auto;
			right:-8px;
			background:${bot.color_schemes[bot.color].user};
			clip-path:polygon(0 0, 100% 50%, 0 100%);
		}
		.disclaimer_message {
			font-size: 12px;
			max-width: 100%;
			border: 1px solid silver;
		}
		.disclaimer_message:after {
			display: none;
		}
		#chat_bot_face {
			position:relative;
			display:flex;
			background:#eee;
			z-index:8;
			margin:0 -20px 0;
			padding:10px;
			font-size:0.9em;
			border-bottom-left-radius: 10px;
			border-bottom-right-radius: 10px;
			box-shadow:0 2px 12px 15px white;
		}
		#bot_face {
			width:40px;
			height:40px;
			background:gray;
			border-radius:5px;
			display:flex;
			justify-content:center;
			align-items:center;
			overflow:hidden;
		}
		#bot_face img {
			object-fit:cover;
			max-width:100%;
			max-height:100%;
			min-width:100%;
			min-height:100%;
		}
		#bot_name {
			line-height:1;
			font-weight:bold;
			display:flex;
			align-items:center;
			padding-left:10px;
			padding-bottom:1px;
		}
		#bot_name small {
			display:block;
			font-weight:normal;
		}
		#chat_overlay {
			display:none;
			position: absolute;
			top:0;
			left:0;
			right:0;
			bottom:0;
			z-index:301;
			background:rgba(255,255,255,0.9);
			padding:20px 50px;
			text-align:center;
			font-size:0.9em;
			justify-content:center;
			align-items:center;
			flex-direction:column;
			color:${bot.color_schemes[bot.color].primary};
		}
		.disconnected #chat_overlay {
			display:flex;
		}
		#chat_overlay button {
			appearance:none;
			background:${bot.color_schemes[bot.color].primary};
			color:white;
			border:none;
			border-radius:5px;
			cursor:pointer;
			transition:0.2s background;
		}
		#chat_overlay button:hover {
			background:${bot.color_schemes[bot.color].primary_hover};
		}
		.chat_rounded_box button {
			appearande:none;
			border:none;
			box-shadow:0 2px 0 rgba(0,0,0,0.5);
			color:${bot.color_schemes[bot.color].light};
			background:${bot.color_schemes[bot.color].primary};
			margin:0 10px 20px 0;
			float: left;
			padding:5px 8px;
			border-radius:5px;
			cursor:pointer;
			font-size:0.7em;
			transition:0.2s background, 0.2s box-shadow;
		}
		.chat_rounded_box button:hover {
			box-shadow:0 0 3px rgba(0,0,0,0.5);
			background:${bot.color_schemes[bot.color].primary_hover};
		}
		.img_message {
			width:80%;
		}
		.img_message img {
			max-width:100%;
			display:block;
			border-radius:3px;
			overflow:hidden;
		}
		.bot_disclaimer {
			position: absolute;
			top: 0;
			left: 0;
			transform: translateY(-100%);
			background: #eee;
			color: black;
			opacity: 0;
			font-family: Arial !important;
			font-size: 11px;
			letter-spacing: 0 !important;
			padding: 1px 5px 1px 3px;
			border-top-right-radius: 5px;
			cursor: pointer;
			pointer-events: none;
			line-height: 1 !important;
			transition: 0.3s all;
		}
		.bot_disclaimer:hover {
			background: orange;
			color: white;
		}
		#chat_window:not(.keyboard_active) .bot_disclaimer {
			top: -32px;
			padding: 4px 4px 4px 8px;
			max-width: 97px;
			border-bottom-right-radius: 5px;
		}
		#chat_window.open_chat .bot_disclaimer {
			pointer-events: all;
			opacity: 1;
		}
		.bot_disclaimer_message {
			background: #ffcc99;
			border: 1px solid orange;
			font-size: 12px;
			position: absolute;
			bottom: calc( 100% + 10px );
			padding: 10px;
			width: 250px;
			max-width: 100000%;
			opacity: 0;
			transform: translateY( 200% );
			transition: 0.3s opacity, 0.3s transform 0.15s;
		}
		.bot_disclaimer_message.open {
			opacity: 1;
			transform: translateY( 0 );
			transition: 0.3s opacity 0.15s, 0.3s transform;
		}
		.bot_disclaimer_message:after {
			background: #ffcc99;
			transform: rotate(-90deg);
			left: 20px;
			bottom: -10px;
			top: auto;
		}
		.bot_disclaimer_x {
			position: absolute;
			width: 10px;
			height: 10px;
			top: 7px;
			right: 2px;
		}
		.bot_disclaimer_x:after,
		.bot_disclaimer_x:before {
			content: '';
			position: absolute;
			background: darkorange;
			width: 10px;
			height: 1px;
			transform: rotate(45deg);
		}
		.bot_disclaimer_x:before {
			transform: rotate(-45deg);
		}
		.bot_disclaimer_x:hover:after,
		.bot_disclaimer_x:hover:before {
			background: black;
		}

	`

export default ChatCSS
