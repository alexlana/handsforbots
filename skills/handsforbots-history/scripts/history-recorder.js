/**
 * History recorder for Hands for Bots.
 *
 * Adds items from your own interface to the H4B session history safely:
 * - waits for `core.history_loaded` (writing earlier erases the saved history);
 * - writes one item at a time (overlapping writes lose data in storage);
 * - gives each item `id` and `ts` (H4B items have neither);
 * - never stalls the queue if a write never resolves.
 *
 * Usage:
 *   import { createHistoryRecorder, readHistory } from './history-recorder.js'
 *   const recorder = createHistoryRecorder( bot, { plugin: 'MyApp' } )
 *   await recorder.record( 'filter_applied', { region: 'south' }, 'Filtered by South' )
 *   const timeline = readHistory( bot )
 */

const DEFAULT_TYPE = 'ui_event'

/**
 * @param {Bot} bot - The Hands for Bots instance.
 * @param {Object} [options]
 * @param {string} [options.plugin='App'] - Value stored in the `plugin` slot.
 * @param {string} [options.type='ui_event'] - Default item type. Use 'input' to also send the item to the
 *        model (universal-llm backend only); then the title must be a non-empty string.
 * @param {number} [options.timeout=3000] - Max ms to wait for one write before moving on.
 */
export function createHistoryRecorder ( bot, options = {} ) {

	const plugin = options.plugin || 'App'
	const defaultType = options.type || DEFAULT_TYPE
	const timeout = options.timeout ?? 3000

	let queue = Promise.resolve()

	const ready = () => {
		if ( bot.history_loaded ) return Promise.resolve()
		return new Promise( resolve => bot.eventEmitter.on( 'core.history_loaded', () => resolve() ) )
	}

	const newId = () => ( globalThis.crypto && crypto.randomUUID )
		? crypto.randomUUID()
		: Date.now().toString( 36 ) + Math.random().toString( 36 ).slice( 2 )

	/**
	 * Record one interface event.
	 * @param {string} action - What happened, e.g. 'filter_applied'.
	 * @param {Object} [data] - JSON-serializable details.
	 * @param {string} [title] - Human-readable label for timelines.
	 * @param {Object} [opts]
	 * @param {string} [opts.type] - Overrides the default type for this item.
	 * @param {string} [opts.text] - For type 'input': the sentence the model receives.
	 * @return {Promise<Object>} The stored payload (with id and ts).
	 */
	function record ( action, data = {}, title = null, opts = {} ) {

		const type = opts.type || defaultType
		const payload = { action, data, ts: Date.now(), id: newId() }
		if ( opts.text ) payload.text = opts.text

		if ( type === 'input' && ( typeof title !== 'string' || title.trim() === '' ) )
			throw new Error( 'Items of type "input" need a non-empty string title, or the Text plugin crashes on reload.' )

		const task = queue.then( async () => {
			await ready()
			await Promise.race([
				bot.addToHistory( type, plugin, payload, title ),
				new Promise( resolve => setTimeout( resolve, timeout ) ),
			])
			return payload
		})

		queue = task.catch( err => console.error( '[history-recorder] Failed to record item:', err ) )
		return task

	}

	return { record, ready }

}

/**
 * Normalized, read-only view of the whole history.
 * @param {Bot} bot
 * @param {Object} [filter]
 * @param {string[]} [filter.types] - Keep only these types.
 * @return {Array<{index:number,type:string,plugin:(string|string[]),title:(string|null),payload:*}>}
 */
export function readHistory ( bot, filter = {} ) {

	return ( bot.history || [] )
		.map( ( [ type, plugin, payload, title ], index ) => {
			let data = payload
			if ( type === 'output' && typeof payload === 'string' ) {
				try { data = JSON.parse( payload ) } catch ( e ) { data = payload }
			}
			let label = title || null
			if ( !label && typeof payload === 'string' && type !== 'output' ) label = payload
			if ( !label && type === 'output' && Array.isArray( data ) )
				label = data.map( m => m && ( m.title || m.text ) ).filter( Boolean ).join( ' ' ) || null
			return { index, type, plugin, title: label, payload: data }
		})
		.filter( item => !filter.types || filter.types.includes( item.type ) )

}
