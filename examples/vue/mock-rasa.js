/**
 * Tiny Rasa-compatible backend for `npm run dev:mock`, so the example runs without Docker.
 * POST /mock/rasa  { message } → [{ recipient_id, text }]
 */
export function mockRasa () {

	const reply = ( message ) => {
		const text = message.toLowerCase()
		if ( text.includes( 'café' ) || text.includes( 'coffee' ) ) {
			// the second identical command is blocked by the loop detector
			return [
				{ text: 'Adicionei um café ao carrinho. [•{"action":"Cart.add","params":{"id":"coffee","name":"Café","qty":1}}•]' },
				{ text: '[•{"action":"Cart.add","params":{"id":"coffee","name":"Café","qty":1}}•]' },
			]
		}
		if ( text.includes( 'limpar' ) || text.includes( 'clear' ) ) {
			return [ { text: 'Vou esvaziar o carrinho. [•{"action":"Cart.clear"}•]' } ]
		}
		return [ {
			text: 'Posso adicionar café ou esvaziar o carrinho.',
			buttons: [
				{ title: 'Quero um café', payload: 'quero um café' },
				{ title: 'Esvaziar carrinho', payload: 'limpar carrinho' },
			],
		} ]
	}

	return {
		name: 'mock-rasa',
		configureServer ( server ) {
			server.middlewares.use( '/mock/rasa', ( req, res ) => {
				let body = ''
				req.on( 'data', ( chunk ) => { body += chunk } )
				req.on( 'end', () => {
					const { message = '' } = JSON.parse( body || '{}' )
					setTimeout( () => {
						res.setHeader( 'Content-Type', 'application/json' )
						res.end( JSON.stringify( reply( message ).map( r => ( { recipient_id: 'user', ...r } ) ) ) )
					}, 400 )
				})
			})
		},
	}

}
