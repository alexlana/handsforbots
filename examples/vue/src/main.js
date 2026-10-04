import { createApp } from 'vue'
import { createHandsForBots, loopDetector } from '@handsforbots/Adapters/Vue/index.js'
import App from './App.vue'

const mock = import.meta.env.VITE_MOCK_BACKEND === 'true'

const app = createApp( App )

app.use( createHandsForBots({
	engine: 'rasa',
	engine_endpoint: mock ? '/mock/rasa' : 'http://localhost/rasa/webhooks/rest/webhook',
	language: 'pt-br',
	presentation: [ { text: 'Oi! Eu converso e também mexo nesta página. Peça um café.' } ],
	// GUI commands: the same command twice without new input is a bug, not intent
	action_policies: [ loopDetector({ maxIdentical: 1 }) ],
}) )

app.mount( '#app' )
