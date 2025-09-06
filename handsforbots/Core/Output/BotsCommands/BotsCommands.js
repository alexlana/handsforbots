
/**
 * Bot's Commands output channel. You can pass commands from the bot text response to plugins.
 * The commands want to be a JSON containing the key `action` where the `class.function` will 
 * be informed, and containing a sequence of keys to pass to your action, wrapped by the "action
 * tags" (open tag: `[•`. close tag: `•]`). Ex.: `[•{"action":"myPlugin.alert","params":"My alert message."}•]`
 * This commands will be extracted by the bot and this plugin will trigger your plugin.
 */
export default class BotsCommandsOutput {

	/**
	 * Bot's Commands output constructor.
	 * @return void
	 */
	constructor ( bot ) {

		this.bot = bot

		this.commands_history_loaded = false

		/**
		 * Event listeners
		 */
		this.bot.eventEmitter.on( 'core.all_ui_loaded', ()=>{
			this.rebuildHistory() // refaz os comandos anteriores
		})
		this.bot.eventEmitter.on( 'core.output_ready', ( payload )=>{
			this.output( payload )
		})

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

				let fn = window[ command.action ];
				if ( !fn ) {

					const classMethod = command.action.split( '.' );
					if (this.bot.outputs[ classMethod[0] ] && classMethod.length === 2) {
						fn = this.bot.outputs[ classMethod[0] ][ classMethod[1] ];
					}

				}

				if (!fn) {
					console.warn( `Can not find function "${command.action}".` );
					return;
				}

				let ret = fn( command.params );

				if ( ret ) {
					ret.then(( result )=>{
						response  = {
							'to_do': obj.do,
							'result': result
						}
						this.bot.eventEmitter.trigger( 'core.action_success', [response] )
						// this.bot.backend.actionSuccess( obj.do, result )
					})
				}

			}

		})

	}

	/**
	 * Trigger previous commands.
	 * @return	void
	 */
	rebuildHistory () {

		for ( var i in this.bot.history ) {
			if ( this.bot.history[i][0] == 'output' ) {
				const output = JSON.parse( this.bot.history[i][2] )
				for ( var j in output ) {
					if ( output[j].do != undefined ) {
						this.output( [ output[j] ] )
					}
				}
			}
		}

		this.commands_history_loaded = true

	}

	/**
	 * It don't have an UI, but want to check in.
	 * @return Void
	 */
	ui ( options ) {

		console.log( '[✔︎] Bot\'s Commands output "UI" added.' )

		this.bot.eventEmitter.trigger( 'core.ui_loaded' )

	}

	waiting () {}

}

