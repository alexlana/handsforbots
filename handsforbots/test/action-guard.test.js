import test from 'node:test'
import assert from 'node:assert/strict'

import EventEmitter from '../Libs/EventEmitter.js'
import ActionGuard, { loopDetector, actionKey } from '../Libs/ActionGuard.js'

function fakeBot ( tools = [] ) {
	return { eventEmitter: new EventEmitter(), mcpHelper: { tools } }
}

const cmd = ( name, params ) => ({ type: 'command', name, params })

test( 'allows everything without policies and records the turn', async ()=>{
	const guard = new ActionGuard( fakeBot() )
	const verdict = await guard.evaluate( cmd( 'Modal.open', { id: 1 } ) )
	assert.equal( verdict.allowed, true )
	assert.equal( guard.turnActions.length, 1 )
})

test( 'policy results: false, "block", object block, modify', async ()=>{
	const bot = fakeBot()
	const blocked = []
	bot.eventEmitter.on( 'core.action_blocked', ( b )=>{ blocked.push( b ) } )

	const guard = new ActionGuard( bot )
	const remove = guard.addPolicy( ()=> false )
	assert.equal( ( await guard.evaluate( cmd( 'a' ) ) ).allowed, false )
	remove()

	guard.addPolicy( function denyB ( action ) {
		if ( action.name === 'b' ) return { decision: 'block', reason: 'no b' }
	})
	guard.addPolicy( ( action )=>{
		if ( action.name === 'c' ) return { decision: 'modify', params: { safe: true } }
	})

	const b = await guard.evaluate( cmd( 'b' ) )
	assert.equal( b.allowed, false )
	assert.equal( b.reason, 'no b' )
	assert.equal( b.policy, 'denyB' )

	const c = await guard.evaluate( cmd( 'c', { safe: false } ) )
	assert.equal( c.allowed, true )
	assert.deepEqual( c.action.params, { safe: true } )

	assert.equal( blocked.length, 2 )
	assert.equal( blocked[1].reason, 'no b' )
})

test( 'a throwing policy blocks (fail-closed)', async ()=>{
	const guard = new ActionGuard( fakeBot(), [ ()=>{ throw new Error( 'boom' ) } ] )
	const verdict = await guard.evaluate( cmd( 'a' ) )
	assert.equal( verdict.allowed, false )
	assert.match( verdict.reason, /policy_error: boom/ )
	assert.equal( guard.turnActions.length, 0 )
})

test( 'async policies are awaited (ex.: ask the user)', async ()=>{
	const guard = new ActionGuard( fakeBot(), [
		async ( action )=> new Promise( r => setTimeout( ()=> r( action.name !== 'Order.delete' ), 5 ) )
	])
	assert.equal( ( await guard.evaluate( cmd( 'Order.delete' ) ) ).allowed, false )
	assert.equal( ( await guard.evaluate( cmd( 'Order.view' ) ) ).allowed, true )
})

test( 'loopDetector blocks the 3rd identical action with defaults (window 4, max 2)', async ()=>{
	const guard = new ActionGuard( fakeBot(), [ loopDetector() ] )
	assert.equal( ( await guard.evaluate( cmd( 'Modal.open', { id: 1 } ) ) ).allowed, true )
	assert.equal( ( await guard.evaluate( cmd( 'Modal.open', { id: 1 } ) ) ).allowed, true )
	const third = await guard.evaluate( cmd( 'Modal.open', { id: 1 } ) )
	assert.equal( third.allowed, false )
	assert.equal( third.policy, 'loopDetector' )
	assert.match( third.reason, /^loop_detected/ )
	// different params is a different action
	assert.equal( ( await guard.evaluate( cmd( 'Modal.open', { id: 2 } ) ) ).allowed, true )
})

test( 'loopDetector: param key order does not matter', async ()=>{
	assert.equal( actionKey( cmd( 'x', { a: 1, b: [ { c: 1, d: 2 } ] } ) ), actionKey( cmd( 'x', { b: [ { d: 2, c: 1 } ], a: 1 } ) ) )
	const guard = new ActionGuard( fakeBot(), [ loopDetector({ maxIdentical: 1 }) ] )
	await guard.evaluate( cmd( 'x', { a: 1, b: 2 } ) )
	assert.equal( ( await guard.evaluate( cmd( 'x', { b: 2, a: 1 } ) ) ).allowed, false )
})

test( 'loopDetector: only looks at the window', async ()=>{
	const guard = new ActionGuard( fakeBot(), [ loopDetector({ windowSize: 2, maxIdentical: 1 }) ] )
	await guard.evaluate( cmd( 'a' ) )
	await guard.evaluate( cmd( 'b' ) )
	await guard.evaluate( cmd( 'c' ) )
	assert.equal( ( await guard.evaluate( cmd( 'a' ) ) ).allowed, true )
})

test( 'loopDetector: new user input resets the turn', async ()=>{
	const bot = fakeBot()
	const guard = new ActionGuard( bot, [ loopDetector({ maxIdentical: 1 }) ] )
	await guard.evaluate( cmd( 'a' ) )
	assert.equal( ( await guard.evaluate( cmd( 'a' ) ) ).allowed, false )
	bot.eventEmitter.trigger( 'core.input_received' )
	const verdict = await guard.evaluate( cmd( 'a' ) )
	assert.equal( verdict.allowed, true )
	assert.equal( verdict.action.turnId, 1 )
})

test( 'loopDetector: allow list and MCP tool allowRepeat', async ()=>{
	const bot = fakeBot([ { name: 'counter-increment', allowRepeat: true } ])
	const guard = new ActionGuard( bot, [ loopDetector({ maxIdentical: 1, allow: [ 'Slides.next' ] }) ] )
	for ( let i = 0; i < 3; i++ ) {
		assert.equal( ( await guard.evaluate( cmd( 'Slides.next' ) ) ).allowed, true )
		assert.equal( ( await guard.evaluate({ type: 'tool', name: 'counter-increment', params: {} }) ).allowed, true )
	}
	await guard.evaluate({ type: 'tool', name: 'search', params: { q: 'x' } })
	assert.equal( ( await guard.evaluate({ type: 'tool', name: 'search', params: { q: 'x' } }) ).allowed, false )
})

test( 'blocked actions do not count toward the window', async ()=>{
	const guard = new ActionGuard( fakeBot(), [ loopDetector({ windowSize: 2, maxIdentical: 1 }) ] )
	await guard.evaluate( cmd( 'a' ) )
	await guard.evaluate( cmd( 'a' ) ) // blocked
	await guard.evaluate( cmd( 'a' ) ) // blocked
	assert.deepEqual( guard.turnActions.map( a => a.name ), [ 'a' ] )
})
