import Bot from '../../Bot.js'


/**
 * Bot's Commands output channel. You can pass commands from the bot text response to plugins.
 * The commands want to be a JSON containing the key `action` where the `class.function` will 
 * be informed, and containing a sequence of keys to pass to your action, wrapped by the "action
 * tags" (open tag: `[*`. close tag: `*]`). Ex.: `[*{"action":"myPlugin.alert","message":"My alert message."}*]`
 * This commands will be extracted by the bot and this plugin will trigger your plugin.
 */
export default class BotsCommandsOutput {

	/**
	 * Bot's Commands output constructor.
	 * @return void
	 */
	constructor () {

		this.name = 'bots_commands'
		this.bot = new Bot()

		this.register()

		console.log('[✔︎] Bot\'s Commands output connected.')

	}

	/**
	 * Output payload.
	 * @param  Array payload Payload from bot to user.
	 * @return Void
	 */
	async output ( payload ) {

		payload.forEach(( obj )=>{

			if ( obj.do != null ) {

				/**
				 * A utilização do Bot's Commands depende de outros plugins (customizados) que vão
				 * reproduzir a ação e da inclusão da `action tag` na resposta do bot. Essa tag pode 
				 * ser gerada nos componentes de Backend ou outros.
				 */
				let command = JSON.parse( obj.do )
				const classMethod = command.action.split('.')

				const ret = this.bot[ classMethod[0] ][ classMethod[1] ]( command.params )

				ret.then(( result )=>{
					this.bot.backend.actionSuccess( obj.do, result )
				})

			}

		})

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
	ui ( options ) {

		console.log( '[✔︎] Bot\'s Commands output "UI" added.' )

		this.bot.UILoaded()

	}

	waiting () {}

}

