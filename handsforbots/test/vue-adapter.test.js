import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp, effectScope, nextTick, watch } from 'vue'

import EventEmitter from '../Libs/EventEmitter.js'
import HeadlessBot from '../Headless/HeadlessBot.js'
import { createHandsForBots } from '../Adapters/Vue/plugin.js'
import { useHandsForBots, useBotCommand, useBotEvent, useActionPolicy } from '../Adapters/Vue/useHandsForBots.js'

function headless () {
	const e = new EventEmitter()
	const bot = {
		eventEmitter: e, history: [], history_loaded: true, backend: {}, commands: {}, policies: [], destroyed: false,
		registerCommand ( n, fn ) { this.commands[n] = fn; return ()=>{ delete this.commands[n] } },
		addActionPolicy ( p ) { this.policies.push( p ); return ()=>{ this.policies = this.policies.filter( x => x !== p ) } },
		clearStorage () { e.trigger( 'core.history_cleared' ) },
		destroy () { this.destroyed = true },
	}
	e.on( 'core.send_to_backend', ( payload )=>{
		e.trigger( 'core.calling_backend' )
		e.trigger( 'core.backend_responded' )
		e.trigger( payload.trigger, [[ { text: 'echo: ' + payload.payload } ]] )
	})
	e.on( 'core.spread_output', ( p )=>{ e.trigger( 'core.output_ready', [p] ) } )
	return new HeadlessBot( bot )
}

test( 'useHandsForBots exposes reactive state and send', async ()=>{
	const h4b = headless()
	const scope = effectScope()
	const api = scope.run( ()=> useHandsForBots( h4b ) )

	assert.equal( api.ready.value, true )
	const seen = []
	scope.run( ()=> watch( api.messages, ( m )=>{ seen.push( m.length ) } ) )

	api.send( 'oi' )
	await nextTick()
	assert.deepEqual( api.messages.value.map( m => m.text ), [ 'oi', 'echo: oi' ] )
	assert.equal( api.thinking.value, false )
	assert.ok( seen.length >= 1 )

	api.clear()
	assert.equal( api.messages.value.length, 0 )

	scope.stop()
	h4b.send( 'depois' )
	assert.equal( api.messages.value.length, 0, 'no updates after the scope is disposed' )
})

test( 'useBotCommand / useBotEvent / useActionPolicy clean up with the scope', ()=>{
	const h4b = headless()
	const scope = effectScope()
	const events = []
	scope.run( ()=>{
		useBotCommand( 'Cart.add', ()=>{}, h4b )
		useBotEvent( 'core.action_blocked', ( b )=> events.push( b ), h4b )
		useActionPolicy( ()=> true, h4b )
	})
	assert.equal( typeof h4b.bot.commands['Cart.add'], 'function' )
	assert.equal( h4b.bot.policies.length, 1 )
	h4b.bot.eventEmitter.trigger( 'core.action_blocked', [ 'x' ] )

	scope.stop()
	h4b.bot.eventEmitter.trigger( 'core.action_blocked', [ 'y' ] )
	assert.equal( h4b.bot.commands['Cart.add'], undefined )
	assert.equal( h4b.bot.policies.length, 0 )
	assert.deepEqual( events, [ 'x' ] )
})

test( 'plugin provides the instance to composables', ()=>{
	const h4b = headless()
	const app = createApp({})
	const plugin = createHandsForBots( h4b )
	assert.equal( plugin.h4b, h4b )
	app.use( plugin )
	const api = app.runWithContext( ()=> useHandsForBots() )
	assert.equal( api.h4b, h4b )
	assert.equal( app.config.globalProperties.$h4b, h4b )
})

test( 'composable without plugin or instance throws a helpful error', ()=>{
	assert.throws( ()=> effectScope().run( ()=> useHandsForBots() ), /createHandsForBots/ )
})
