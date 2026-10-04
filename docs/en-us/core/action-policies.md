##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs' home](../../../README.md) / [core](../core.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../pt-br/core/action-policies.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./action-policies.md)

</div>


# Action Policies (`action_policies`)


Every action the bot asks to run goes through an interception point first:

- **commands** `[•{"action": ...}•]`, executed by the [Bot's Commands](./output/botscommands.md) output;
- **MCP tools**, executed by `MCPHelper` (see [MCP Tools](../plugins/mcp-tools.md)).

Hands for Bots provides the **mechanism**; the **rules** (what to block, when to ask for confirmation, permissions) live in your project, as policies. A loop detector ships as an optional built-in policy.

```text
backend response → extract command/tool → policies → execute
                                              └─ blocked: drop the action, keep the text, emit core.action_blocked
```


## Setup


```javascript
import Bot from './handsforbots/Bot.js'
import { loopDetector } from './handsforbots/Libs/ActionGuard.js'

const bot = new Bot({
  // ...
  action_policies: [
    loopDetector({ windowSize: 4, maxIdentical: 2, allow: ['Slides.next'] }),

    // project rule: confirm destructive actions
    async ( action ) => {
      if ( action.name === 'Order.delete' ) {
        return window.confirm( 'Delete the order?' ) ? 'allow' : { decision: 'block', reason: 'user_declined' }
      }
    },
  ],
})

// or at runtime
const remove = bot.addActionPolicy( myPolicy )
remove()
```


## Policy contract


```javascript
async ( action, ctx ) => result
```

| Field | Description |
|-------|-------------|
| `action.type` | `'command'` or `'tool'` |
| `action.name` | Command name (`Class.method`) or MCP tool name |
| `action.params` | Parameters (command `params`, tool `parameters`) |
| `action.turnId` | Current turn; changes on every user input (`core.input_received`) |
| `ctx.bot` | Bot instance |
| `ctx.turnActions` | Actions already executed in this turn (oldest first) |

| Result | Effect |
|--------|--------|
| `undefined`, `true`, `'allow'` | Continue to the next policy |
| `false`, `'block'` | Block |
| `{ decision: 'block', reason }` | Block with a reason |
| `{ decision: 'modify', params }` | Replace the parameters and continue |

- Policies run in order and may be async (e.g. ask the user).
- A policy that throws **blocks** the action (fail-closed).
- Commands replayed when the history is restored (`rebuildHistory`, after a page reload) **skip** the policies: they were accepted when they first ran.


## Loop detector


`loopDetector( options )` blocks the same action, with the same parameters, repeated without a new user input.

| Option | Default | Description |
|--------|---------|-------------|
| `windowSize` | `4` | How many recent actions of the turn to look at |
| `maxIdentical` | `2` | Identical executions allowed in the window; the next one is blocked |
| `allow` | `[]` | Action names that may repeat freely (e.g. `'Slides.next'`) |

- Parameters are compared canonically: `{a:1,b:2}` and `{b:2,a:1}` are the same action.
- The count resets on every user input.
- MCP tools can opt out with `allowRepeat: true` in their definition.
- Blocked actions do not count toward the window.


## `core.action_blocked` event


```javascript
bot.eventEmitter.on( 'core.action_blocked', ( blocked ) => {
  // { allowed: false, action, reason, policy }
})
```

When an MCP tool is blocked, the result sent to the LLM as feedback is `{ success: false, blocked: true, error }`, so the model can explain it to the user.


## Out of scope


- **Tool round limit (`maxActionRoundtrips`)**: belongs to whoever runs the agent loop. If the loop runs in your backend, the limit lives there.
- **Token limits and rate limiting**: must be enforced server side; in the browser they can be bypassed.
