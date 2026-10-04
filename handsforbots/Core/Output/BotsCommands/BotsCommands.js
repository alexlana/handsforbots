
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
	 * @param  Array	payload	Payload from bot to user.
	 * @param  Boolean	replay	True when re-running commands from history.
	 * @return Void
	 */
	async output ( payload, replay = false ) {

		for ( const obj of payload ) {

			if ( obj.do == null ) {
				continue
			}

			/**
			 * A utilização do Bot's Commands depende de outros plugins (customizados) que vão
			 * reproduzir a ação e da inclusão da `action tag` na resposta do bot. Essa tag pode 
			 * ser gerada nos componentes de Backend ou outros.
			 */
			let command
			try {
				command = JSON.parse( obj.do )
			} catch ( error ) {
				console.warn( `Can not parse bot's command "${obj.do}".` )
				continue
			}

			/**
			 * Action policies (loop detector, project rules) may block or rewrite the command.
			 * The text of the message was already delivered by the other outputs.
			 */
			const verdict = await this.bot.actionGuard.evaluate({
				type: 'command',
				name: command.action,
				params: command.params,
				replay: replay,
			})
			if ( ! verdict.allowed ) {
				continue
			}
			const params = verdict.action.params

			let fn = window[ command.action ];
			if ( !fn ) {

				const classMethod = command.action.split( '.' );
				if (this.bot.outputs[ classMethod[0] ] && classMethod.length === 2) {
					fn = this.bot.outputs[ classMethod[0] ][ classMethod[1] ];
				}

			}

			if (!fn) {
				console.warn( `Can not find function "${command.action}".` );
				continue;
			}

			let ret = fn( params );

			if ( ret && typeof ret.then === 'function' ) {
				ret.then(( result )=>{
					const response = {
						'to_do': obj.do,
						'result': result
					}
					this.bot.eventEmitter.trigger( 'core.action_success', [response] )
					// this.bot.backend.actionSuccess( obj.do, result )
				})
			}

		}

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
						this.output( [ output[j] ], true )
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

