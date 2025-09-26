/**
 * TextLayoutCSS - Generates CSS for different text input layouts
 * 
 * Provides CSS generation for all layout combinations:
 * - sidebar + floating (default - exact current behavior)
 * - sidebar + snap
 * - main + floating  
 * - main + snap
 * 
 * Ensures the default layout maintains exactly the same CSS as current implementation
 */

/**
 * Generate complete CSS for a specific layout configuration
 * @param {Object} bot - Bot instance with color schemes
 * @param {Object} layout - Layout configuration object
 * @returns {string} Generated CSS string
 */
export function generateLayoutCSS(bot, layout) {
    const baseCSS = getBaseCSS(bot)
    const positionCSS = getPositionCSS(layout.position, bot)
    const displayCSS = getDisplayModeCSS(layout.display_mode, bot, layout.position)
    
    return `${baseCSS}\n${positionCSS}\n${displayCSS}`
}

/**
 * Get base CSS that applies to all layouts
 * @param {Object} bot - Bot instance
 * @returns {string} Base CSS
 */
function getBaseCSS(bot) {
    return `
        .chat_box {
            display: block !important;
            font-family: sans-serif;
            box-sizing: border-box;
            overflow: hidden;
            font-size: 16px;
            transition: 0.3s max-height, 0.3s border-radius;
        }
        .chat_box.open_chat {
            max-height: 500px;
        }
        .chat_box.keyboard_active.open_chat {
            border-bottom-left-radius: 20px;
            border-bottom-right-radius: 20px;
        }
        .chat_box * {
            box-sizing: border-box;
            line-height: 1.3;
            letter-spacing: 0;
        }
        .chat_box ul,
        .chat_box ol {
            padding-left: 20px !important;
            list-style-position: outside !important;
            margin: 0 !important;
        }
        .chat_box ul li,
        .chat_box ol li {
            margin: 6px 0 !important;
        }
        #chat_body {
            scroll-behavior: smooth;
            height: 374px;
            max-height: calc(96vh - 110px);
            position: relative;
            margin: 0 -20px;
            padding: 0 20px;
            overflow: scroll;
        }
        .inner_chat {
            padding-bottom: 80px;
        }
        .inner_chat a {
            text-decoration: none;
            padding: 0 5px;
            color: white;
            border-radius: 2px;
            background-color: ${bot.color_schemes[bot.color].dark};
            overflow-wrap: break-word;
            transition: 0.3s background-color, 0.3s color;
        }
        .inner_chat a:hover {
            color: black;
            background-color: white;
        }
        .chat_box h5 {
            position: relative;
            color: white;
            background: ${bot.color_schemes[bot.color].primary};
            margin: -18px -20px 0;
            padding: 10px 20px;
            cursor: pointer;
            font-size: 0.9em;
            z-index: 10;
            height: 38px;
            text-align: center;
            transition: 0.2s background;
        }
        .chat_box h5:hover {
            background: ${bot.color_schemes[bot.color].primary_hover};
        }
        .chat_box h5 button {
            pointer-events: none;
            position: absolute;
            top: 0;
            right: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 37px;
            width: 40px;
            appearance: none;
            background: transparent;
            color: white;
            border: none;
            font-size: 0.75em;
            font-weight: bold;
            box-shadow: none;
            transition: 0.3s transform ease-in-out, 0.3s right ease-in-out;
        }
        .chat_box.open_chat h5 button {
            transform: rotate(180deg);
            right: 8px;
        }
        .chat_box form {
            display: flex;
            padding: 0;
            margin: 0 -20px;
            position: absolute;
            bottom: -60px;
            left: 20px;
            width: 100%;
            z-index: 300;
            transition: 0.3s;
        }
        .chat_box.keyboard_active.open_chat form {
            bottom: 0;
        }
        .chat_box.waiting form {
            pointer-events: none;
        }
        .chat_box input {
            appearance: none;
            font-size: 0.9em;
            padding: 17px 10px;
            border: none;
            outline: none;
        }
        .chat_box input[type="text"] {
            border-top-right-radius: 10px;
            color: #333333;
            width: 72%;
            padding-left: 15px;
            color: black;
            background: ${bot.color_schemes[bot.color].light};
        }
        .chat_box input[type="text"]:focus {
            box-shadow: none;
            border: none;
            outline: none;
        }
        .chat_box input[type="text"]::placeholder {
            color: ${bot.color_schemes[bot.color].primary};
            opacity: 0.5;
        }
        .chat_box input[type="text"]::-webkit-input-placeholder {
            color: ${bot.color_schemes[bot.color].primary};
            opacity: 0.5;
        }
        .chat_box input[type="text"]:-ms-input-placeholder {
            color: ${bot.color_schemes[bot.color].primary};
            opacity: 0.5;
        }
        .chat_box input[type="submit"] {
            cursor: pointer;
            width: 28%;
            padding-right: 15px;
            text-transform: uppercase;
            color: ${bot.color_schemes[bot.color].dark};
            background: ${bot.color_schemes[bot.color].light};
            border-top-left-radius: 10px;
            transition: 0.4s all;
            letter-space: 0.9;
        }
        .chat_box input[type="submit"]:hover {
            text-shadow: 0 0 2px rgba(0,0,0,0.7);
            color: white;
            background: ${bot.color_schemes[bot.color].dark};
        }
        .chat_box input[type="submit"]:active {
            color: ${bot.color_schemes[bot.color].dark};
            background: ${bot.color_schemes[bot.color].light};
            text-shadow: 0 0 0 transparent;
            transition: 0.2s;
        }
        .chat_box:not(.keyboard_active) input[type="text"],
        .chat_box:not(.keyboard_active) input[type="submit"] {
            user-select: none;
            -webkit-user-select: none;
            pointer-events: none;
        }
        .chat_message {
            position: relative;
            border-radius: 6px;
            background: #eee;
            max-width: 80%;
            min-width: 20px;
            min-height: 32px;
            padding: 0 8px;
            font-size: 0.9em;
            color: black;
            float: left;
            clear: both;
        }
        .chat_message p {
            margin: 6px 0 !important;
        }
        .chat_div_extra {
            display: block!important;
            height: 20px;
            clear: both;
        }
        .chat_message:after {
            content: "";
            display: block;
            width: 10px;
            height: 16px;
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            left: -8px;
            background: #eee;
            clip-path: polygon(0 50%, 100% 0, 100% 100%);
        }
        .chat_message.error {
            background: #ffdddd;
            color: #660000
        }
        .chat_message.error:after {
            background: #ffdddd
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
            0% { opacity: 0; }
            50% { opacity: 1; }
            90% { opacity: 0; }
            100% { opacity: 0; }
        }
        .user_message {
            text-align: right;
            background: ${bot.color_schemes[bot.color].user};
            float: right;
        }
        .user_message:after {
            left: auto;
            right: -8px;
            background: ${bot.color_schemes[bot.color].user};
            clip-path: polygon(0 0, 100% 50%, 0 100%);
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
            position: relative;
            display: flex;
            background: #eee;
            z-index: 8;
            margin: 0 -20px 0;
            padding: 10px;
            font-size: 0.9em;
            border-bottom-left-radius: 10px;
            border-bottom-right-radius: 10px;
            box-shadow: 0 2px 12px 15px white;
        }
        #bot_face {
            width: 40px;
            height: 40px;
            background: gray;
            border-radius: 5px;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }
        #bot_face img {
            object-fit: cover;
            max-width: 100%;
            max-height: 100%;
            min-width: 100%;
            min-height: 100%;
        }
        #bot_name {
            line-height: 1;
            font-weight: bold;
            display: flex;
            align-items: center;
            padding-left: 10px;
            padding-bottom: 1px;
        }
        #bot_name small {
            display: block;
            font-weight: normal;
        }
        #chat_overlay {
            display: none;
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 301;
            background: rgba(255,255,255,0.9);
            padding: 20px 50px;
            text-align: center;
            font-size: 0.9em;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            color: ${bot.color_schemes[bot.color].primary};
        }
        .disconnected #chat_overlay {
            display: flex;
        }
        .buttons_wrapper:after {
            content: '';
            display: block;
            clear: both;
        }
        #chat_overlay button {
            appearance: none;
            background: ${bot.color_schemes[bot.color].primary};
            color: white;
            border: none;
            border-radius: 5px;
            margin-left: auto;
            margin-right: auto;
            float: none;
            cursor: pointer;
            transition: 0.2s background;
        }
        #chat_overlay button:hover {
            background: ${bot.color_schemes[bot.color].primary_hover};
        }
        .chat_box button {
            appearande: none;
            border: none;
            box-shadow: 0 2px 0 rgba(0,0,0,0.5);
            color: ${bot.color_schemes[bot.color].light};
            background: ${bot.color_schemes[bot.color].primary};
            margin: 0 10px 20px 0;
            float: left;
            padding: 5px 8px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 0.8em;
            transition: 0.2s background, 0.2s box-shadow;
        }
        .chat_box button:hover {
            box-shadow: 0 0 3px rgba(0,0,0,0.5);
            background: ${bot.color_schemes[bot.color].primary_hover};
        }
        .img_message {
            width: 80%;
        }
        .img_message img {
            max-width: 100%;
            display: block;
            border-radius: 3px;
            overflow: hidden;
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
            bottom: calc(100% + 10px);
            padding: 10px;
            width: 250px;
            max-width: 100000%;
            opacity: 0;
            transform: translateY(200%);
            transition: 0.3s opacity, 0.3s transform 0.15s;
        }
        .bot_disclaimer_message.open {
            opacity: 1;
            transform: translateY(0);
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
        
        /* Always open chat window styles */
        .chat_box.always_open {
            cursor: default;
        }
        
        .chat_box.always_open h5 {
            cursor: default;
        }
        
        .chat_box.always_open h5:hover {
            background: ${bot.color_schemes[bot.color].primary};
        }
        
        .chat_box.always_open.open_chat {
            max-height: 100vh;
        }
        
        .chat_box.always_open #chat_body {
            max-height: calc(100vh - 100px);
        }
        
        /* Header layout modes */
        .chat_box.header-hidden h5 {
            display: none;
        }
        
        .chat_box.header-floating h5 {
            display: flex;
            align-content: center;
            position: fixed;
            top: 20px;
            right: 20px;
            background: none;
            color: #333;
            font-size: 14px;
            z-index: 1001;
            padding: 10px 38px 7px 12px;
            border-radius: 6px;
            backdrop-filter: blur(10px);
            background: rgba(255, 255, 255, 0.7);
            box-shadow: 0 0 0 rgba(0,0,0,0);
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .chat_box.header-floating h5:hover {
            background: rgba(255, 255, 255, 1);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .chat_box.header-floating h5 button {
            margin-left: 8px;
            font-size: 12px;
            color: #333;
            right: 0;
            margin-right: 0;
        }
        
        /* Floating header with always_open - adjust padding and button color */
        .chat_box.header-floating.always_open h5 {
            padding-right: 12px;
        }
        
        .chat_box.header-floating.always_open h5 button {
            color: inherit;
            margin-left: 8px;
        }
        
        /* Bot face layout modes */
        .chat_box.bot-face-hidden #chat_bot_face {
            display: none;
        }
        
        .chat_box.bot-face-floating #chat_bot_face {
            position: fixed;
            top: 1px;
            left: 20px;
            background: none;
            z-index: 1001;
            padding: 8px;
            border-radius: 6px;
            backdrop-filter: blur(10px);
            background: rgba(255, 255, 255, 0.7);
            box-shadow: 0 0 0 rgba(0,0,0,0);
            opacity: 0;
            pointer-events: none;
            transition: all 0.3s ease;
        }
        .chat_box.bot-face-floating.open_chat #chat_bot_face {
            opacity: 1;
            pointer-events: auto;
        }
        
        .chat_box.bot-face-floating #chat_bot_face:hover {
            background: rgba(255, 255, 255, 1);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .chat_box.bot-face-floating #chat_body {
            max-height: 100vh;
        }

        /* Bot face floating positioning for sidebar */
        .chat_box.bot-face-floating.sidebar #chat_bot_face {
            left: auto;
            right: 300px; /* Width of sidebar chat window */
            transform: translateX(100%);
            margin: 0;
        }

        .chat_box.bot-face-floating #bot_face {
            width: 32px;
            height: 32px;
        }
        
        .chat_box.bot-face-floating #bot_name {
            font-size: 12px;
            margin-top: 4px;
        }
        
        .chat_box.bot-face-floating #bot_name small {
            font-size: 10px;
        }
        
        /* Adjust chat body when header is floating or hidden */
        .chat_box.header-floating #chat_body,
        .chat_box.header-hidden #chat_body {
            margin-top: 0;
            padding-top: 10px;
        }
        
        /* Adjust chat body when bot face is floating or hidden */
        .chat_box.bot-face-floating #chat_body,
        .chat_box.bot-face-hidden #chat_body {
            margin-top: 0;
        }
    `
}

/**
 * Get position-specific CSS
 * @param {string} position - 'sidebar' or 'main'
 * @param {Object} bot - Bot instance
 * @returns {string} Position CSS
 */
function getPositionCSS(position, bot) {
    if (position === 'sidebar') {
        return getSidebarCSS(bot)
    } else if (position === 'main') {
        return getMainCSS(bot)
    }
    return ''
}

/**
 * Get display mode specific CSS
 * @param {string} displayMode - 'floating' or 'snap'
 * @param {Object} bot - Bot instance
 * @param {string} position - Position context for snap mode
 * @returns {string} Display mode CSS
 */
function getDisplayModeCSS(displayMode, bot, position) {
    if (displayMode === 'floating') {
        return getFloatingCSS(bot)
    } else if (displayMode === 'snap') {
        return getSnapCSS(bot, position)
    }
    return ''
}

/**
 * Get sidebar positioning CSS - EXACT current implementation
 * @param {Object} bot - Bot instance
 * @returns {string} Sidebar CSS
 */
function getSidebarCSS(bot) {
    return `
        .chat_box {
            width: 300px;
            max-width: calc(100% - 40px);
            position: fixed;
            bottom: 10px;
            right: 20px;
            max-height: 38px;
        }
    `
}

/**
 * Get main positioning CSS for prominent display
 * @param {Object} bot - Bot instance
 * @returns {string} Main CSS
 */
function getMainCSS(bot) {
    return `
        .chat_box {
            width: 100%;
            max-width: 100vw;
            max-height: 60px;
            position: fixed;
            bottom: 0;
            left: 50%;
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
            transform: translateX(-50%);
        }
        
        /* Main position specific adjustments */
        .chat_box.open_chat {
            max-height: 90vh;
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
        }
        
        /* Adjust chat body height for main position */
        .chat_box #chat_body {
            height: 90vh;
            max-height: calc(90vh - 110px);
        }

        .chat_box.keyboard_active.open_chat {
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
        }
    `
}

/**
 * Get floating interaction CSS - EXACT current implementation
 * @param {Object} bot - Bot instance
 * @returns {string} Floating CSS
 */
function getFloatingCSS(bot) {
    return `
        .chat_box {
            padding: 18px 20px;
            background: white;
            border-radius: 40px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.3);
            z-index: 1000;
        }
    `
}

/**
 * Get snap display CSS for integrated appearance
 * @param {Object} bot - Bot instance
 * @param {string} position - Position context
 * @returns {string} Snap CSS
 */
function getSnapCSS(bot, position) {
    let chat_box = `
        .chat_box {
            max-height: 38px;
            box-shadow: none;
        }
    `
    if (position === 'sidebar') {
        chat_box = `
            .chat_box {
                max-height: 100vh;
                box-shadow: 0 3px 8px rgba(0,0,0,0.3);
            }
        `
    }
    return `
        ${chat_box}
        .chat_box {
            padding: 18px 20px;
            background: white;
            border-radius: 0;
            bottom: 0;
            right: 0;
            z-index: 100;
        }
        
        /* Snap mode specific adjustments */
        .chat_box.keyboard_active.open_chat {
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
        }
        
        /* Softer visual integration */
        .chat_box h5 {
            border-radius: 0 0 0 0;
        }
        
        /* Remove some floating-specific effects */
        #chat_bot_face {
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .chat_box.open_chat {
            max-height: 100vh;
        }
        .chat_box #chat_body {
            height: 100vh;
            max-height: calc(100vh - 110px);
        }

    `
}

/**
 * Get CSS for specific layout combination (convenience function)
 * @param {Object} bot - Bot instance
 * @param {string} position - 'sidebar' or 'main'
 * @param {string} displayMode - 'floating' or 'snap'
 * @returns {string} Complete CSS for the layout combination
 */
export function getLayoutCombinationCSS(bot, position, displayMode) {
    return generateLayoutCSS(bot, { position, display_mode: displayMode })
}

export default generateLayoutCSS
