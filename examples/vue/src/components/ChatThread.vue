<script setup>
import { ref, watch, nextTick } from 'vue'
import { useHandsForBots } from '@handsforbots/Adapters/Vue/index.js'

const { messages, thinking, ready, send, clear } = useHandsForBots()

const draft = ref( '' )
const list = ref( null )

function submit () {
	if ( send( draft.value ) ) draft.value = ''
}

watch( () => messages.value.length, async () => {
	await nextTick()
	list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' })
})
</script>

<template>
	<section class="panel chat" aria-label="Assistente">
		<header>
			<strong>Assistente</strong>
			<button type="button" class="link" @click="clear">Limpar conversa</button>
		</header>

		<ol ref="list" class="messages" aria-live="polite">
			<li v-for="message in messages" :key="message.id" :class="message.role">
				<span v-if="message.text">{{ message.text }}</span>
				<!-- inline content from MCP tools comes from your own plugins -->
				<div v-if="message.html" v-html="message.html"></div>
				<img v-for="src in message.images" :key="src" :src="src" alt="" />
				<div v-if="message.buttons.length" class="buttons">
					<button v-for="button in message.buttons" :key="button.payload" type="button"
						@click="send( button.payload, { title: button.title } )">{{ button.title }}</button>
				</div>
			</li>
			<li v-if="thinking" class="assistant thinking">…</li>
		</ol>

		<form @submit.prevent="submit">
			<input v-model="draft" :disabled="!ready" placeholder="Escreva uma mensagem" aria-label="Mensagem" />
			<button type="submit" :disabled="!ready || thinking">Enviar</button>
		</form>
	</section>
</template>

<style scoped>
.chat { display: flex; flex-direction: column; min-height: 420px; max-height: calc(100vh - 32px); }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.messages { list-style: none; margin: 0; padding: 0; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.messages li { max-width: 85%; padding: 8px 12px; border-radius: 12px; background: var(--bg); }
.messages li.user { align-self: flex-end; background: var(--user); }
.thinking { color: var(--muted); }
.buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
form { display: flex; gap: 8px; margin-top: 12px; }
input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--panel); color: var(--text); }
button { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--accent); color: #fff; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.buttons button, .link { background: transparent; color: var(--accent); }
.link { border: 0; padding: 0; }
</style>
