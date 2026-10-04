##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./vue.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/adapters/vue.md)

</div>


# Adapter Vue


Composables Vue 3 sobre o [modo headless](../headless.md): o app renderiza a conversa com os próprios componentes, e o Hands for Bots cuida de backend, MCP, políticas de ação, histórico e comandos na GUI.

Requer Vue ≥ 3.3. Exemplo completo: [`examples/vue`](../../../examples/vue).


## Instalação


```javascript
// main.js
import { createApp } from 'vue'
import { createHandsForBots, loopDetector } from './handsforbots/Adapters/Vue/index.js'
import App from './App.vue'

createApp( App )
  .use( createHandsForBots({
    engine: 'rasa',
    engine_endpoint: 'https://meu-backend/webhooks/rest/webhook',
    language: 'pt-br',
    action_policies: [ loopDetector({ maxIdentical: 1 }) ],
  }) )
  .mount( '#app' )
```

`createHandsForBots` aceita as opções do `createHeadlessBot` ou uma instância de `HeadlessBot` já criada. O bot é destruído quando o app é desmontado (Vue ≥ 3.5).

Se o Hands for Bots ficar fora do projeto (ex.: alias no Vite), configure `resolve.dedupe: ['vue']` para o adapter usar a mesma cópia do Vue que o app.


## `useHandsForBots()`


```vue
<script setup>
import { ref } from 'vue'
import { useHandsForBots } from './handsforbots/Adapters/Vue/index.js'

const { messages, thinking, ready, send, clear } = useHandsForBots()
const draft = ref( '' )
</script>

<template>
  <ol>
    <li v-for="m in messages" :key="m.id" :class="m.role">
      {{ m.text }}
      <button v-for="b in m.buttons" :key="b.payload" @click="send( b.payload, { title: b.title } )">{{ b.title }}</button>
    </li>
    <li v-if="thinking">…</li>
  </ol>
  <form @submit.prevent="send( draft ) && ( draft = '' )">
    <input v-model="draft" :disabled="!ready" />
  </form>
</template>
```

| Retorno | Tipo | Descrição |
|---------|------|-----------|
| `messages` | `ComputedRef<Message[]>` | Ver formato em [modo headless](../headless.md#estado) |
| `thinking` | `ComputedRef<boolean>` | Aguardando o backend |
| `status`, `ready` | `ComputedRef` | `'loading' \| 'ready' \| 'destroyed'` e atalho booleano |
| `state` | `ComputedRef<State>` | Estado completo |
| `send( payload, { title } )` | função | Envia entrada do usuário |
| `clear()` | função | Limpa o histórico |
| `on`, `registerCommand`, `addActionPolicy` | funções | Versões sem limpeza automática |
| `h4b` | `HeadlessBot` | Instância |


## Comandos na GUI: `useBotCommand()`


Liga um comando do bot a uma função do componente enquanto ele estiver montado:

```javascript
import { useBotCommand } from './handsforbots/Adapters/Vue/index.js'

// backend: "Abrindo o mapa. [•{"action": "Map.focus", "params": {"lat": -23.5, "lng": -46.6}}•]"
useBotCommand( 'Map.focus', ( { lat, lng } ) => map.flyTo( [ lat, lng ] ) )
```

No reload, os comandos aceitos do histórico são reexecutados para restaurar o estado da tela. Prefira comandos idempotentes ("mostrar X", "ir para Y") a incrementais.


## Políticas no componente: `useActionPolicy()`


```javascript
import { useActionPolicy } from './handsforbots/Adapters/Vue/index.js'

useActionPolicy( async ( action ) => {
  if ( action.name === 'Doc.replaceAll' ) {
    return ( await meuDialogo.confirmar( 'Substituir o texto todo?' ) ) ? 'allow' : 'block'
  }
})
```

Ver [Políticas de Ação](../core/action-policies.md).


## Eventos: `useBotEvent()`


```javascript
useBotEvent( 'core.action_blocked', ( blocked ) => toast( `Bloqueado: ${blocked.action.name}` ) )
```


## Fora de componentes


Todos os composables aceitam a instância como último argumento, para uso em stores (Pinia) ou testes:

```javascript
const plugin = createHandsForBots( options )
const { messages } = useHandsForBots( plugin.h4b )
```
