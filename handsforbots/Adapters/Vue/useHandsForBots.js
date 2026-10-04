/**
 * Vue composables for Hands for Bots (headless mode).
 *
 *   const { messages, thinking, ready, send } = useHandsForBots()
 *   useBotCommand( 'Cart.add', ( params ) => cart.add( params ) )
 *   useBotEvent( 'core.action_blocked', ( blocked ) => toast( blocked.reason ) )
 *
 * The bot comes from `app.use( createHandsForBots( options ) )` or can be passed
 * explicitly (a `HeadlessBot` instance).
 */

import { shallowRef, computed, inject, hasInjectionContext, getCurrentScope, onScopeDispose } from 'vue'

export const HANDS_FOR_BOTS_KEY = Symbol( 'handsforbots' )

/**
 * Reactive conversation state and actions.
 * @param  {HeadlessBot} [h4b] - Defaults to the instance provided by the plugin
 * @return {Object}
 */
export function useHandsForBots ( h4b ) {

	h4b = resolve( h4b, 'useHandsForBots' )

	const state = shallowRef( h4b.getState() )
	const stop = h4b.subscribe( ( next )=>{ state.value = next } )
	whenDisposed( stop )

	return {
		state: computed( ()=> state.value ),
		messages: computed( ()=> state.value.messages ),
		status: computed( ()=> state.value.status ),
		thinking: computed( ()=> state.value.thinking ),
		ready: computed( ()=> state.value.status === 'ready' ),
		send: ( payload, options )=> h4b.send( payload, options ),
		clear: ()=> h4b.clear(),
		on: ( name, fn )=> h4b.on( name, fn ),
		registerCommand: ( name, fn )=> h4b.registerCommand( name, fn ),
		addActionPolicy: ( policy )=> h4b.addActionPolicy( policy ),
		h4b: h4b,
	}

}

/**
 * Let the bot call `fn` through a command (`[•{"action": name, "params": ...}•]`)
 * while the calling component is mounted.
 * @param  {string}   name
 * @param  {Function} fn - Receives the command params
 * @param  {HeadlessBot} [h4b]
 * @return {Function} Unregister
 */
export function useBotCommand ( name, fn, h4b ) {

	h4b = resolve( h4b, 'useBotCommand' )
	const unregister = h4b.registerCommand( name, fn )
	whenDisposed( unregister )
	return unregister

}

/**
 * Listen to a bot event while the calling component is mounted.
 * @param  {string}   name - Ex.: 'core.action_blocked'
 * @param  {Function} fn
 * @param  {HeadlessBot} [h4b]
 * @return {Function} Unsubscribe
 */
export function useBotEvent ( name, fn, h4b ) {

	h4b = resolve( h4b, 'useBotEvent' )
	const off = h4b.on( name, fn )
	whenDisposed( off )
	return off

}

/**
 * Register an action policy while the calling component is mounted
 * (ex.: confirm destructive commands with the app's own dialog).
 * @param  {Function} policy
 * @param  {HeadlessBot} [h4b]
 * @return {Function} Remove
 */
export function useActionPolicy ( policy, h4b ) {

	h4b = resolve( h4b, 'useActionPolicy' )
	const remove = h4b.addActionPolicy( policy )
	whenDisposed( remove )
	return remove

}

function resolve ( h4b, caller ) {

	if ( ! h4b && hasInjectionContext() ) {
		h4b = inject( HANDS_FOR_BOTS_KEY, null )
	}
	if ( ! h4b ) {
		throw new Error( `${caller}(): no Hands for Bots instance. Install the plugin with app.use( createHandsForBots( options ) ) or pass a HeadlessBot.` )
	}
	return h4b

}

function whenDisposed ( fn ) {

	if ( getCurrentScope() ) {
		onScopeDispose( fn )
	}

}
