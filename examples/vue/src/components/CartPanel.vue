<script setup>
import { reactive, computed } from 'vue'
import { useBotCommand, useActionPolicy } from '@handsforbots/Adapters/Vue/index.js'

const items = reactive( {} )
const total = computed( () => Object.values( items ).reduce( ( sum, item ) => sum + item.qty, 0 ) )

// [•{"action":"Cart.add","params":{"id":"coffee","name":"Café","qty":1}}•]
useBotCommand( 'Cart.add', ( { id, name, qty = 1 } ) => {
	items[ id ] = { name, qty: ( items[ id ]?.qty || 0 ) + qty }
})

// [•{"action":"Cart.clear"}•]
useBotCommand( 'Cart.clear', () => {
	for ( const id in items ) delete items[ id ]
})

// project rule: destructive commands need the user's confirmation
useActionPolicy( ( action ) => {
	if ( action.name === 'Cart.clear' && total.value > 0 ) {
		return window.confirm( 'O assistente quer esvaziar o carrinho. Permitir?' )
			? 'allow'
			: { decision: 'block', reason: 'user_declined' }
	}
})
</script>

<template>
	<section class="panel cart" aria-label="Carrinho">
		<h1>Carrinho <small>({{ total }})</small></h1>
		<p v-if="total === 0" class="empty">Vazio. Peça um café ao assistente.</p>
		<ul v-else>
			<li v-for="( item, id ) in items" :key="id" :data-id="id">{{ item.name }} × {{ item.qty }}</li>
		</ul>
	</section>
</template>

<style scoped>
h1 { margin: 0 0 12px; font-size: 1.25rem; }
small, .empty { color: var(--muted); }
ul { padding-left: 20px; }
</style>
