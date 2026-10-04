##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](./README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./headless.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../en-us/headless.md)

</div>


# Modo Headless


O modo headless roda o Hands for Bots **sem a UI de chat dele**: backend, MCP, políticas de ação, histórico, sincronização entre abas e observabilidade continuam no H4B, e o app host renderiza a conversa com os próprios componentes e design system.

Para Vue, use o [adapter Vue](./adapters/vue.md), que é construído sobre este modo.


## Uso


```javascript
import { createHeadlessBot, loopDetector } from './handsforbots/Headless/index.js'

const h4b = createHeadlessBot({
  engine: 'rasa',
  engine_endpoint: 'https://meu-backend/webhooks/rest/webhook',
  language: 'pt-br',
  action_policies: [ loopDetector() ],
})

// estado -> UI do host
const stop = h4b.subscribe( ( state ) => {
  render( state.messages, state.thinking )
})

// comandos que o bot pode acionar na GUI, sem expor nada em `window`
h4b.registerCommand( 'Cart.add', ( params ) => cart.add( params.id, params.qty ) )

// entrada do usuário
h4b.send( 'Quero dois cafés' )
h4b.send( '/buy{"id":3}', { title: 'Comprar' } ) // payload ≠ texto exibido

// ao desmontar
stop()
h4b.destroy()
```

`createHeadlessBot( options )` aceita as mesmas opções do `new Bot()`. Plugins sem UI (ex.: `Observability`, plugins MCP) continuam funcionando. O plugin [Comandos de Bots](./core/output/botscommands.md) é incluído automaticamente; use `commands: false` para desligar.


## Estado


`getState()` e `subscribe()` entregam um objeto **novo a cada mudança** (compatível com `useSyncExternalStore` no React e `shallowRef` no Vue):

| Campo | Descrição |
|-------|-----------|
| `status` | `'loading'` → `'ready'` (backend registrado e histórico carregado) → `'destroyed'` |
| `thinking` | `true` enquanto aguarda o backend |
| `messages` | Mensagens do usuário e do assistente, incluindo as restauradas do histórico e as de outras abas |

Mensagem:

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador estável para `key` |
| `role` | `'user'` ou `'assistant'` |
| `text` | Texto, já sem as tags de comando `[•…•]` |
| `html` | Conteúdo inline de tools MCP, quando houver |
| `buttons`, `images` | Como enviados pelo backend |
| `type`, `source` | Ex.: `'inline_mcp_content'` e o nome da tool |
| `raw` | Item original |

Mensagens enviadas antes de `status === 'ready'` ficam na fila e são enviadas quando o bot fica pronto.


## API


| Método | Descrição |
|--------|-----------|
| `send( payload, { title } )` | Envia uma entrada do usuário |
| `subscribe( fn )` | Escuta mudanças de estado; retorna a função para cancelar |
| `getState()` | Estado atual |
| `on( evento, fn )` | Escuta um evento do bot (ex.: `'core.action_blocked'`); retorna a função para cancelar |
| `registerCommand( nome, fn )` | Registra um comando; retorna a função para remover |
| `addActionPolicy( fn )` | Registra uma [política de ação](./core/action-policies.md) |
| `clear()` | Limpa o histórico |
| `destroy()` | Para de escutar e libera recursos (canal entre abas, worker de criptografia) |
| `bot` | Instância do `Bot`, para usos avançados |


## Comandos do bot


O `registerCommand` é o jeito recomendado de expor ações da GUI ao bot no modo headless. O backend continua usando a mesma sintaxe:

```text
Adicionei ao carrinho. [•{"action": "Cart.add", "params": {"id": 3, "qty": 2}}•]
```

A busca do comando segue a ordem: comandos registrados → função global em `window` → `Plugin.metodo` de um output.


## Limitações


- Só roda no navegador (usa `localStorage`, `Worker` e `BroadcastChannel`). Em SSR, crie o bot apenas no cliente.
- Plugins de UI do H4B (Text, Voice) podem ser usados junto, mas aí a UI deles também aparece.
