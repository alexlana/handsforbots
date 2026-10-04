
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
		this.all_ui_loaded = false
		this.bot_history_loaded = false

		/**
		 * Event listeners
		 * Previous commands are re-run once both the plugins' UIs and the history are loaded.
		 */
		this.bot.eventEmitter.on( 'core.all_ui_loaded', ()=>{
			this.all_ui_loaded = true
			this.maybeRebuildHistory()
		})
		this.bot.eventEmitter.on( 'core.history_loaded', ()=>{
			this.bot_history_loaded = true
			this.maybeRebuildHistory()
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

			let fn = this.bot.commands[ command.action ] || window[ command.action ];
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

	maybeRebuildHistory () {

		if ( this.all_ui_loaded && this.bot_history_loaded && ! this.commands_history_loaded ) {
			this.rebuildHistory() // refaz os comandos anteriores
		}

	}

	/**
	 * Trigger previous commands, in order. Each user input in the history starts a new
	 * turn in the action guard, so replay-aware policies (loop detector) reach the same
	 * decisions as when the commands first ran.
	 * @return	void
	 */
	async rebuildHistory () {

		this.commands_history_loaded = true

		const guard = this.bot.actionGuard
		guard.newTurn()

		for ( const entry of this.bot.history ) {
			if ( entry[0] == 'input' ) {
				guard.newTurn()
			} else if ( entry[0] == 'output' ) {
				let output
				try {
					output = JSON.parse( entry[2] )
				} catch ( error ) {
					continue
				}
				for ( const item of output ) {
					if ( item.do != undefined ) {
						await this.output( [ item ], true )
					}
				}
			}
		}

		guard.newTurn()

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

