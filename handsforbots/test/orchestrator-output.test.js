import test from 'node:test'
import assert from 'node:assert/strict'

import EventEmitter from '../Libs/EventEmitter.js'
import ActionGuard, { loopDetector } from '../Libs/ActionGuard.js'
import BotOrchestrator from '../Core/BotOrchestrator.js'

function setup ( policies = [] ) {
	const bot = {
		action_tag_open: '[•',
		action_tag_close: '•]',
		eventEmitter: new EventEmitter(),
		ui_outputs: { Text: true },
		redirectInput: null,
		stored: [],
		bc: { postMessage () {} },
		async addToHistory ( type, plugin, payload ) { this.stored.push( [ type, payload ] ) },
	}
	bot.actionGuard = new ActionGuard( bot, policies )
	const orchestrator = new BotOrchestrator( bot )
	const delivered = []
	bot.eventEmitter.on( 'core.output_ready', ( payload )=>{ delivered.push( payload ) } )
	return { bot, orchestrator, delivered }
}

const cmd = ( action, params )=> `[•${ JSON.stringify({ action, params }) }•]`
const settle = ()=> new Promise( r => setTimeout( r, 20 ) )

test( 'outputs without commands are delivered synchronously, as before', ()=>{
	const { orchestrator, delivered } = setup()
	orchestrator.spreadOutput([ { text: 'oi' } ])
	assert.equal( delivered.length, 1 )
})

test( 'blocked commands are removed before history; text is kept', async ()=>{
	const { bot, orchestrator, delivered } = setup([ loopDetector({ maxIdentical: 1 }) ])
	orchestrator.spreadOutput([
		{ text: 'Adicionei ' + cmd( 'Cart.add', { id: 1 } ) },
		{ text: cmd( 'Cart.add', { id: 1 } ) },
	])
	await settle()

	const [ out ] = delivered
	assert.equal( out[0].text, 'Adicionei ' )
	assert.equal( JSON.parse( out[0].do ).action, 'Cart.add' )
	assert.equal( out[1].do, null )
	assert.equal( out[1].blocked_action.policy, 'loopDetector' )

	const history = JSON.parse( bot.stored[0][1] )
	assert.equal( history.filter( o => o.do ).length, 1, 'history keeps only the allowed command' )
})

test( 'modify rewrites the stored command params', async ()=>{
	const { orchestrator, delivered } = setup([ ()=>( { decision: 'modify', params: { qty: 1 } } ) ])
	orchestrator.spreadOutput([ { text: cmd( 'Cart.add', { qty: 99 } ) } ])
	await settle()
	assert.deepEqual( JSON.parse( delivered[0][0].do ), { action: 'Cart.add', params: { qty: 1 } } )
})

test( 'outputs keep their order while an async policy decides', async ()=>{
	let release
	const { orchestrator, delivered } = setup([ ()=> new Promise( r => { release = r } ) ])
	orchestrator.spreadOutput([ { text: 'primeiro ' + cmd( 'Cart.clear' ) } ])
	orchestrator.spreadOutput([ { text: 'segundo' } ])
	await settle()
	assert.equal( delivered.length, 0, 'second output waits for the first' )
	release( 'allow' )
	await settle()
	assert.deepEqual( delivered.map( p => p[0].text ), [ 'primeiro ', 'segundo' ] )
	// queue drained: back to synchronous delivery
	orchestrator.spreadOutput([ { text: 'terceiro' } ])
	assert.equal( delivered.length, 3 )
})
