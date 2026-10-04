##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../README.md) / [core](../core.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./action-policies.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/core/action-policies.md)

</div>


# Políticas de Ação (`action_policies`)


Toda ação que o bot pede para executar passa por um ponto de interceptação antes de rodar:

- **comandos** `[•{"action": ...}•]`, executados pelo plugin [Comandos de Bots](./output/botscommands.md);
- **tools MCP**, executadas pelo `MCPHelper` (ver [Ferramentas MCP](../plugins/mcp-tools.md)).

O Hands for Bots fornece o **mecanismo**; as **regras** (o que bloquear, quando pedir confirmação, permissões) ficam no seu projeto, como políticas. O detector de loop vem pronto como política opcional.

```text
resposta do backend → extrai comando/tool → políticas → executa
                                                 └─ bloqueado: descarta a ação, mantém o texto, emite core.action_blocked
```


## Configuração


```javascript
import Bot from './handsforbots/Bot.js'
import { loopDetector } from './handsforbots/Libs/ActionGuard.js'

const bot = new Bot({
  // ...
  action_policies: [
    loopDetector({ windowSize: 4, maxIdentical: 2, allow: ['Slides.next'] }),

    // regra do projeto: confirmar ações destrutivas
    async ( action ) => {
      if ( action.name === 'Order.delete' ) {
        return window.confirm( 'Excluir o pedido?' ) ? 'allow' : { decision: 'block', reason: 'user_declined' }
      }
    },
  ],
})

// ou em tempo de execução
const remove = bot.addActionPolicy( minhaPolitica )
remove()
```


## Contrato da política


```javascript
async ( action, ctx ) => resultado
```

| Campo | Descrição |
|-------|-----------|
| `action.type` | `'command'` ou `'tool'` |
| `action.name` | Nome do comando (`Classe.metodo`) ou da tool MCP |
| `action.params` | Parâmetros (`params` do comando, `parameters` da tool) |
| `action.turnId` | Turno atual; muda a cada nova entrada do usuário (`core.input_received`) |
| `ctx.bot` | Instância do bot |
| `ctx.turnActions` | Ações já executadas neste turno (mais antiga primeiro) |

| Resultado | Efeito |
|-----------|--------|
| `undefined`, `true`, `'allow'` | Segue para a próxima política |
| `false`, `'block'` | Bloqueia |
| `{ decision: 'block', reason }` | Bloqueia com motivo |
| `{ decision: 'modify', params }` | Troca os parâmetros e segue |

- As políticas rodam em ordem e podem ser assíncronas (ex.: pedir confirmação ao usuário).
- Política que lança exceção **bloqueia** a ação (fail-closed).
- Ao recarregar a página, o plugin Comandos de Bots reexecuta os comandos do histórico (`action.replay === true`). Nesse replay só rodam políticas marcadas com `runOnReplay = true`, como o `loopDetector`, que chega à mesma decisão do turno original. Políticas interativas (confirmação, permissões) não são perguntadas de novo, e bloqueios no replay não disparam `core.action_blocked`.


## Detector de loop


`loopDetector( options )` bloqueia a mesma ação, com os mesmos parâmetros, repetida sem nova entrada do usuário.

| Opção | Padrão | Descrição |
|-------|--------|-----------|
| `windowSize` | `4` | Quantas ações recentes do turno analisar |
| `maxIdentical` | `2` | Execuções idênticas permitidas na janela; a seguinte é bloqueada |
| `allow` | `[]` | Nomes de ações que podem repetir livremente (ex.: `'Slides.next'`) |

- Os parâmetros são comparados de forma canônica: `{a:1,b:2}` e `{b:2,a:1}` são a mesma ação.
- A contagem zera a cada nova entrada do usuário.
- Tools MCP podem sair do detector com `allowRepeat: true` na definição.
- Ações bloqueadas não contam para a janela.


## Evento `core.action_blocked`


```javascript
bot.eventEmitter.on( 'core.action_blocked', ( blocked ) => {
  // { allowed: false, action, reason, policy }
})
```

Quando uma tool MCP é bloqueada, o resultado enviado ao LLM no feedback é `{ success: false, blocked: true, error }`, para que o modelo possa explicar ao usuário.


## O que fica fora


- **Limite de rodadas de tools (`maxActionRoundtrips`)**: pertence a quem roda o loop do agente. Se o loop roda no seu backend, o limite é dele.
- **Limite de tokens e rate limit**: devem ser aplicados no servidor; no navegador podem ser contornados.
