/**
 * ActionGuard — interception point between extracting an action from the bot
 * response and executing it.
 *
 * Actions are bot's commands (`[•{...}•]`, checked by the orchestrator before the
 * output is stored in history and delivered) and MCP tool calls (checked by
 * MCPHelper before executing). The guard runs the configured policies in order.
 * Blocked commands are removed from the output, so history only keeps commands
 * that were allowed, and a page reload replays exactly those.
 *
 * The mechanism lives in the lib; the rules (what to block, ask the user, rewrite)
 * live in the host project as policies. `loopDetector` is a built-in, opt-in policy.
 *
 * A policy is `async ( action, ctx ) => result`, where:
 *
 *  - action: { type: 'command'|'tool', name, params, turnId }
 *  - ctx:    { bot, turnActions } — turnActions are the actions already executed
 *            since the last user input (oldest first).
 *  - result: undefined | true | 'allow'           → continue to the next policy
 *            false | 'block'                       → block
 *            { decision: 'block', reason }         → block with a reason
 *            { decision: 'modify', params, reason }→ replace params and continue
 *
 * A policy that throws blocks the action (fail-closed).
 */
export default class ActionGuard {

	/**
	 * @param {Object} bot - Bot instance (needs `eventEmitter`)
	 * @param {Array<Function>} policies - Initial policies
	 */
	constructor ( bot, policies = [] ) {

		this.bot = bot
		this.policies = []
		this.turnId = 0
		this.turnActions = []

		for ( const policy of policies ) {
			this.addPolicy( policy )
		}

		/**
		 * A new user input starts a new turn: identical actions are fine again.
		 */
		this.bot.eventEmitter.on( 'core.input_received', ()=>{
			this.newTurn()
		})

	}

	/**
	 * Register a policy at runtime.
	 * @param  {Function} policy
	 * @return {Function} Function that removes the policy
	 */
	addPolicy ( policy ) {

		if ( typeof policy !== 'function' ) {
			throw new Error( 'Action policy must be a function.' )
		}
		this.policies.push( policy )
		return ()=>{ this.removePolicy( policy ) }

	}

	/**
	 * Remove a policy.
	 * @param {Function} policy
	 */
	removePolicy ( policy ) {

		this.policies = this.policies.filter( p => p !== policy )

	}

	/**
	 * Start a new turn and forget the actions of the previous one.
	 */
	newTurn () {

		this.turnId++
		this.turnActions = []

	}

	/**
	 * Run the policies for an action.
	 *
	 * @param  {Object} action - { type, name, params }
	 * @return {Promise<Object>} { allowed, action, reason, policy }
	 */
	async evaluate ( action ) {

		const current = {
			type: action.type,
			name: action.name,
			params: action.params,
			turnId: this.turnId,
		}

		const ctx = {
			bot: this.bot,
			turnActions: this.turnActions.slice(),
		}

		for ( const policy of this.policies ) {

			let result
			try {
				result = await policy( current, ctx )
			} catch ( error ) {
				return this.block( current, policy, `policy_error: ${error.message}` )
			}

			if ( result === undefined || result === null || result === true || result === 'allow' ) {
				continue
			}
			if ( result === false || result === 'block' ) {
				return this.block( current, policy, 'blocked' )
			}
			if ( typeof result === 'object' ) {
				if ( result.decision === 'block' ) {
					return this.block( current, policy, result.reason || 'blocked' )
				}
				if ( result.decision === 'modify' ) {
					current.params = result.params
					continue
				}
				if ( result.decision === undefined || result.decision === 'allow' ) {
					continue
				}
			}

			console.warn( `[⚠] Unknown action policy result from "${policyName( policy )}":`, result )

		}

		this.turnActions.push({ type: current.type, name: current.name, params: current.params })

		return { allowed: true, action: current }

	}

	/**
	 * Build a "blocked" result and notify listeners.
	 */
	block ( action, policy, reason ) {

		const blocked = {
			allowed: false,
			action: action,
			reason: reason,
			policy: policyName( policy ),
		}

		console.warn( `[⚠] Action "${action.name}" blocked by "${blocked.policy}": ${reason}` )
		this.bot.eventEmitter.trigger( 'core.action_blocked', [blocked] )

		return blocked

	}

}

/**
 * Canonical key for an action: type + name + params with sorted object keys,
 * so `{a:1,b:2}` and `{b:2,a:1}` are the same action.
 * @param  {Object} action
 * @return {string}
 */
export function actionKey ( action ) {

	return action.type + ':' + action.name + ':' + stableStringify( action.params )

}

/**
 * Built-in policy: blocks an action repeated with the same parameters without
 * a new user input.
 *
 * The action is blocked when, counting it, it would appear more than
 * `maxIdentical` times among the last `windowSize` actions of the current turn.
 *
 * @param  {Object} options
 * @param  {number} options.windowSize   - Recent actions to look at (default 4)
 * @param  {number} options.maxIdentical - Identical executions allowed in the window (default 2)
 * @param  {Array<string>} options.allow - Action names that may repeat freely (ex.: 'Slides.next')
 * @return {Function} Policy
 */
export function loopDetector ( options = {} ) {

	const windowSize = options.windowSize ?? 4
	const maxIdentical = options.maxIdentical ?? 2
	const allow = new Set( options.allow || [] )

	const policy = ( action, ctx )=>{

		if ( allow.has( action.name ) ) {
			return
		}
		if ( action.type === 'tool' && toolAllowsRepeat( ctx.bot, action.name ) ) {
			return
		}

		const key = actionKey( action )
		const recent = ctx.turnActions.slice( -windowSize )
		const identical = recent.filter( a => actionKey( a ) === key ).length

		if ( identical + 1 > maxIdentical ) {
			return {
				decision: 'block',
				reason: `loop_detected: "${action.name}" repeated ${identical + 1}x without new input (max ${maxIdentical} in the last ${windowSize} actions)`,
			}
		}

	}

	Object.defineProperty( policy, 'name', { value: 'loopDetector' } )

	return policy

}

/**
 * MCP tools can opt out of the loop detector with `allowRepeat: true` in their definition.
 */
function toolAllowsRepeat ( bot, name ) {

	const tools = bot?.mcpHelper?.tools || []
	const tool = tools.find( t => t.name === name )
	return !!( tool && tool.allowRepeat )

}

function policyName ( policy ) {

	return ( policy && policy.name ) || 'anonymous'

}

function stableStringify ( value ) {

	if ( value === undefined ) {
		return 'undefined'
	}
	if ( value === null || typeof value !== 'object' ) {
		return JSON.stringify( value )
	}
	if ( Array.isArray( value ) ) {
		return '[' + value.map( stableStringify ).join( ',' ) + ']'
	}
	const keys = Object.keys( value ).sort()
	return '{' + keys.map( k => JSON.stringify( k ) + ':' + stableStringify( value[k] ) ).join( ',' ) + '}'

}
