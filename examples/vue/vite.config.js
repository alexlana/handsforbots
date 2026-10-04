import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { mockRasa } from './mock-rasa.js'

const handsforbots = fileURLToPath( new URL( '../../handsforbots', import.meta.url ) )

export default {
	plugins: [
		vue(),
		process.env.VITE_MOCK_BACKEND === 'true' && mockRasa(),
	],
	resolve: {
		alias: { '@handsforbots': handsforbots },
		// the adapter must use the app's Vue, not a copy installed next to the lib
		dedupe: [ 'vue' ],
	},
	server: {
		host: true,
		fs: { allow: [ '.', handsforbots ] },
	},
}
