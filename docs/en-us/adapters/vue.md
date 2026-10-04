##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../pt-br/adapters/vue.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./vue.md)

</div>


# Vue Adapter


Vue 3 composables on top of [headless mode](../headless.md): the app renders the conversation with its own components, and Hands for Bots handles backend, MCP, action policies, history and GUI commands.

Requires Vue ≥ 3.3. Full example: [`examples/vue`](../../../examples/vue).


## Setup


```javascript
// main.js
import { createApp } from 'vue'
import { createHandsForBots, loopDetector } from './handsforbots/Adapters/Vue/index.js'
import App from './App.vue'

createApp( App )
  .use( createHandsForBots({
    engine: 'rasa',
    engine_endpoint: 'https://my-backend/webhooks/rest/webhook',
    language: 'en-us',
    action_policies: [ loopDetector({ maxIdentical: 1 }) ],
  }) )
  .mount( '#app' )
```

`createHandsForBots` takes `createHeadlessBot` options or an existing `HeadlessBot` instance. The bot is destroyed when the app unmounts (Vue ≥ 3.5).

If Hands for Bots lives outside the project (e.g. a Vite alias), set `resolve.dedupe: ['vue']` so the adapter uses the app's copy of Vue.


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

| Returns | Type | Description |
|---------|------|-------------|
| `messages` | `ComputedRef<Message[]>` | See the format in [headless mode](../headless.md#state) |
| `thinking` | `ComputedRef<boolean>` | Waiting for the backend |
| `status`, `ready` | `ComputedRef` | `'loading' \| 'ready' \| 'destroyed'` and a boolean shortcut |
| `state` | `ComputedRef<State>` | Full state |
| `send( payload, { title } )` | function | Send a user input |
| `clear()` | function | Clear the history |
| `on`, `registerCommand`, `addActionPolicy` | functions | Versions without automatic cleanup |
| `h4b` | `HeadlessBot` | Instance |


## GUI commands: `useBotCommand()`


Binds a bot command to a component function while the component is mounted:

```javascript
import { useBotCommand } from './handsforbots/Adapters/Vue/index.js'

// backend: "Opening the map. [•{"action": "Map.focus", "params": {"lat": -23.5, "lng": -46.6}}•]"
useBotCommand( 'Map.focus', ( { lat, lng } ) => map.flyTo( [ lat, lng ] ) )
```

On reload, allowed commands from history run again to restore the screen state. Prefer idempotent commands ("show X", "go to Y") over incremental ones.


## Component policies: `useActionPolicy()`


```javascript
import { useActionPolicy } from './handsforbots/Adapters/Vue/index.js'

useActionPolicy( async ( action ) => {
  if ( action.name === 'Doc.replaceAll' ) {
    return ( await myDialog.confirm( 'Replace the whole text?' ) ) ? 'allow' : 'block'
  }
})
```

See [Action Policies](../core/action-policies.md).


## Events: `useBotEvent()`


```javascript
useBotEvent( 'core.action_blocked', ( blocked ) => toast( `Blocked: ${blocked.action.name}` ) )
```


## Outside components


Every composable takes the instance as its last argument, for stores (Pinia) or tests:

```javascript
const plugin = createHandsForBots( options )
const { messages } = useHandsForBots( plugin.h4b )
```
