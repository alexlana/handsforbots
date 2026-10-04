<script setup>
import { ref } from 'vue'
import { useBotEvent } from '@handsforbots/Adapters/Vue/index.js'
import ChatThread from './components/ChatThread.vue'
import CartPanel from './components/CartPanel.vue'

const notice = ref( '' )

// show what the action policies blocked
useBotEvent( 'core.action_blocked', ( blocked ) => {
	notice.value = `Ação "${blocked.action.name}" bloqueada (${blocked.policy}).`
	setTimeout( () => { notice.value = '' }, 4000 )
})
</script>

<template>
	<main class="layout">
		<CartPanel />
		<ChatThread />
		<p v-if="notice" class="notice" role="status">{{ notice }}</p>
	</main>
</template>

<style>
:root { --bg: #f6f7f9; --panel: #fff; --text: #1d2330; --muted: #6b7280; --accent: #2563eb; --user: #dbe7ff; --border: #e3e6eb; }
@media (prefers-color-scheme: dark) {
	:root { --bg: #111317; --panel: #1b1e24; --text: #e8eaee; --muted: #9aa1ad; --accent: #6b9bff; --user: #23345a; --border: #2c3038; }
}
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); }
.layout { display: grid; grid-template-columns: 1fr minmax(320px, 420px); gap: 16px; padding: 16px; height: 100vh; }
@media (max-width: 720px) { .layout { grid-template-columns: 1fr; height: auto; } }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.notice { position: fixed; bottom: 16px; left: 16px; margin: 0; padding: 8px 12px; border-radius: 8px; background: var(--text); color: var(--bg); }
</style>
