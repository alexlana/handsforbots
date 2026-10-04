import test from 'node:test'
import assert from 'node:assert/strict'

import EventEmitter from '../Libs/EventEmitter.js'
import HeadlessBot from '../Headless/HeadlessBot.js'

/**
 * Minimal bot: same events as the real one, backend answered by `reply`.
 */
function fakeBot ( { history = [], reply = ( text )=> [{ recipient_id: 'u', text: 'echo: ' + text }] } = {} ) {
	const bot = {
		eventEmitter: new EventEmitter(),
		history: history,
		history_loaded: false,
		backend: null,
		commands: {},
		sent: [],
		destroyed: false,
		registerCommand ( name, fn ) { this.commands[name] = fn; return ()=>{ delete this.commands[name] } },
		clearStorage () { this.history = []; this.eventEmitter.trigger( 'core.history_cleared' ) },
		destroy () { this.destroyed = true },
	}
	const e = bot.eventEmitter
	e.on( 'core.send_to_backend', async ( payload )=>{
		bot.sent.push( payload )
		e.trigger( 'core.calling_backend' )
		const response = await reply( payload.payload )
		e.trigger( 'core.backend_responded' )
		e.trigger( payload.trigger, [response] )
	})
	e.on( 'core.spread_output', ( payload )=>{ e.trigger( 'core.output_ready', [payload] ) } )
	bot.boot = ()=>{
		bot.backend = {}
		e.trigger( 'core.loaded' )
		bot.history_loaded = true
		e.trigger( 'core.history_loaded' )
	}
	return bot
}

const tick = ()=> new Promise( r => setTimeout( r, 0 ) )

test( 'starts loading, becomes ready after backend and history', ()=>{
	const bot = fakeBot()
	const h4b = new HeadlessBot( bot )
	assert.equal( h4b.getState().status, 'loading' )
	bot.boot()
	assert.equal( h4b.getState().status, 'ready' )
})

test( 'queues messages sent before ready', async ()=>{
	const bot = fakeBot()
	const h4b = new HeadlessBot( bot )
	h4b.send( 'oi' )
	assert.equal( bot.sent.length, 0 )
	bot.boot()
	await tick()
	assert.equal( bot.sent.length, 1 )
	assert.equal( bot.sent[0].plugin, 'Headless' )
	assert.deepEqual( h4b.getState().messages.map( m => [ m.role, m.text ] ), [ [ 'user', 'oi' ], [ 'assistant', 'echo: oi' ] ] )
})

test( 'send/receive updates thinking and messages; title is what the user sees', async ()=>{
	let release
	const bot = fakeBot({ reply: ()=> new Promise( r => { release = ()=> r([ { text: 'ok' } ]) } ) })
	const h4b = new HeadlessBot( bot )
	bot.boot()
	const states = []
	h4b.subscribe( s => states.push( s ) )

	h4b.send( '/buy{"id":3}', { title: 'Comprar' } )
	assert.equal( h4b.getState().thinking, true )
	assert.equal( h4b.getState().messages[0].text, 'Comprar' )
	assert.equal( h4b.getState().messages[0].raw, '/buy{"id":3}' )

	release()
	await tick()
	assert.equal( h4b.getState().thinking, false )
	assert.equal( h4b.getState().messages[1].text, 'ok' )

	// immutable snapshots
	assert.notEqual( states[0], states[states.length - 1] )
	assert.notEqual( states[0].messages, states[states.length - 1].messages )
})

test( 'ignores empty input and command-only outputs; keeps buttons, images and html', ()=>{
	const bot = fakeBot()
	const h4b = new HeadlessBot( bot )
	bot.boot()
	assert.equal( h4b.send( '   ' ), false )
	bot.eventEmitter.trigger( 'core.output_ready', [[
		{ text: '', do: '{"action":"x"}' },
		{ text: 'escolha', buttons: [ { title: 'A', payload: '/a' } ] },
		{ image: 'a.png' },
		{ text: '', html: '<b>card</b>', type: 'inline_mcp_content', plugin_source: 'gallery' },
	]] )
	const msgs = h4b.getState().messages
	assert.equal( msgs.length, 3 )
	assert.equal( msgs[0].buttons[0].title, 'A' )
	assert.deepEqual( msgs[1].images, [ 'a.png' ] )
	assert.equal( msgs[2].html, '<b>card</b>' )
	assert.equal( msgs[2].source, 'gallery' )
})

test( 'restores messages from history', ()=>{
	const bot = fakeBot()
	const h4b = new HeadlessBot( bot )
	bot.history = [
		[ 'input', 'Text', '/greet', 'Olá' ],
		[ 'output', [ 'Text' ], JSON.stringify([ { text: 'Oi!' } ]), null ],
		[ 'feedback', 'mcp', 'ignored', 'Tool Feedback' ],
	]
	bot.boot()
	assert.deepEqual( h4b.getState().messages.map( m => [ m.role, m.text ] ), [ [ 'user', 'Olá' ], [ 'assistant', 'Oi!' ] ] )
	h4b.clear()
	assert.equal( h4b.getState().messages.length, 0 )
})

test( 'messages from other tabs and other input plugins', ()=>{
	const bot = fakeBot()
	const h4b = new HeadlessBot( bot )
	bot.boot()
	bot.eventEmitter.trigger( 'core.input', [{ plugin: 'Voice', payload: 'falado' }] )
	bot.eventEmitter.trigger( 'core.other_window_input', [ 'outra aba' ] )
	bot.eventEmitter.trigger( 'core.other_window_output', [[ { text: 'resposta' } ]] )
	assert.deepEqual( h4b.getState().messages.map( m => m.text ), [ 'falado', 'outra aba', 'resposta' ] )
})

test( 'on() listeners can be removed one by one', ()=>{
	const bot = fakeBot()
	const h4b = new HeadlessBot( bot )
	const a = [], b = []
	const offA = h4b.on( 'core.action_blocked', x => a.push( x ) )
	h4b.on( 'core.action_blocked', x => b.push( x ) )
	bot.eventEmitter.trigger( 'core.action_blocked', [ 1 ] )
	offA()
	bot.eventEmitter.trigger( 'core.action_blocked', [ 2 ] )
	assert.deepEqual( a, [ 1 ] )
	assert.deepEqual( b, [ 1, 2 ] )
})

test( 'destroy stops updates, rejects sends and releases the bot', ()=>{
	const bot = fakeBot()
	const h4b = new HeadlessBot( bot )
	bot.boot()
	const unregister = h4b.registerCommand( 'Cart.add', ()=>{} )
	assert.equal( typeof bot.commands['Cart.add'], 'function' )
	unregister()
	assert.equal( bot.commands['Cart.add'], undefined )

	h4b.destroy()
	assert.equal( bot.destroyed, true )
	assert.equal( h4b.getState().status, 'destroyed' )
	bot.eventEmitter.trigger( 'core.output_ready', [[ { text: 'late' } ]] )
	assert.equal( h4b.getState().messages.length, 0 )
	assert.throws( ()=> h4b.send( 'x' ) )
})
