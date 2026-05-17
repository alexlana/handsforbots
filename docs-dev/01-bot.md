# Fluxo — `Bot.js`

O `Bot.js` é o ponto de entrada da aplicação. Ele monta dependências das **Libs**, instancia o **BotOrchestrator**, registra ouvintes no **EventEmitter** e repassa todo o fluxo operacional ao orchestrator sem implementar a lógica de fila/backend diretamente.

Arquivo: [`handsforbots/Bot.js`](../handsforbots/Bot.js)

## Arquitetura estática

```mermaid
flowchart TB
  subgraph BotConstructor["Bot.constructor(options)"]
    OPT["options: core[], plugins[], engine, storage_side…"]
    QS["quick_start? → core[] presets"]
    MCPH["MCPHelper(bot)"]
    EE["EventEmitter"]
    SA["BotSessionAdapter"]
    ORCH["BotOrchestrator(bot)"]
    BC["BroadcastChannel('bot')"]
    REG["orchestrator.registerBackend()"]
    LOAD["orchestrator.loadPlugins()"]
    LISTEN["eventEmitter.on(core.*)"]
  end

  OPT --> QS
  QS --> ORCH
  MCPH --> BotState["bot.mcp, bot.queue, bot.history…"]
  EE --> LISTEN
  SA --> SM["SessionManager via Libs"]
  ORCH --> REG
  ORCH --> LOAD
  BC --> EE
  LISTEN --> ORCH
```

## Bootstrap assíncrono (ordem real)

```mermaid
sequenceDiagram
  participant App as App / página
  participant Bot as Bot.js
  participant Orch as BotOrchestrator
  participant BE as Core/Backend
  participant Plugins as Core + Plugins

  App->>Bot: new Bot(options)
  Note over Bot: sync: EventEmitter, SessionAdapter,<br/>Crypto Worker, BroadcastChannel
  Bot->>Orch: registerBackend(engine)
  Orch->>BE: dynamic import (Rasa/OpenAI/…)
  BE-->>Orch: backend instanciado
  Orch->>Bot: trigger core.loaded

  Bot->>Orch: loadPlugins()
  loop cada item em options.core
    Orch->>Plugins: await pluginLoader (dynamic import)
    Orch->>Orch: registerPluginMCPItems
  end
  loop cada item em options.plugins
    Orch->>Plugins: await pluginLoader
  end
  loop loadSequence
    Plugins->>Plugins: plugin.ui() → DOM
    Plugins->>Bot: trigger core.ui_loaded
  end
  Orch->>Bot: await rebuildHistory()
  alt histórico vazio e presentation
    Orch->>Orch: spreadOutput(presentation)
  end
```

## Barramento de eventos no `Bot.js`

O Bot **não** processa mensagens diretamente: ele só encadeia eventos ao orchestrator (e em um caso ao backend).

```mermaid
flowchart LR
  subgraph Emitters["Quem dispara"]
    INP["Input plugins"]
    OUTP["Output / MCP"]
    ORCH2["BotOrchestrator"]
  end

  subgraph Bus["bot.eventEmitter"]
    E1["core.send_to_backend"]
    E2["core.backend_responded"]
    E3["core.spread_output"]
    E4["core.input"]
    E5["core.ui_loaded"]
    E6["core.renew_session"]
    E7["core.action_success"]
    E8["mcp.tool_feedback_received"]
    E9["core.redirect_input"]
  end

  subgraph Handlers["Bot.js on() →"]
    H1["orchestrator.sendToBackend"]
    H2["orchestrator.nextQueuedMessage"]
    H3["orchestrator.spreadOutput"]
    H4["orchestrator.input"]
    H5["orchestrator.UILoaded"]
    H6["renewSession()"]
    H7["backend.actionSuccess"]
    H8["orchestrator.handleToolFeedback"]
    H9["bot.redirectInput = plugin"]
  end

  INP --> E1 & E4
  OUTP --> E3 & E7
  ORCH2 --> E2
  E1 --> H1
  E2 --> H2
  E3 --> H3
  E4 --> H4
  E5 --> H5
  E6 --> H6
  E7 --> H7
  E8 --> H8
  E9 --> H9
```

## Estado compartilhado relevante

| Propriedade | Onde é usada | Função no fluxo assíncrono |
|-------------|--------------|----------------------------|
| `calling_backend` | Orchestrator + fila | Evita chamadas paralelas ao motor |
| `queue[]` | Orchestrator | Mensagens enfileiradas enquanto `calling_backend` |
| `redirectInput` | Orchestrator | Desvia `sendToBackend` para um output plugin |
| `history[]` | SessionManager + UI rebuild | Persistência e replay (BotsCommands) |
| `inputs` / `outputs` | Orchestrator, BotsCommands | Registro de plugins por nome |
| `ui_outputs` | spreadOutput | Lista de outputs que recebem `core.output_ready` |
| `bc` (BroadcastChannel) | input/output sync | Réplica entre abas/janelas |

## Sincronização entre abas (`BroadcastChannel`)

```mermaid
sequenceDiagram
  participant TabA as Aba A
  participant BC as BroadcastChannel bot
  participant TabB as Aba B

  TabA->>TabA: orchestrator.input()
  TabA->>BC: postMessage core.input_received
  BC->>TabB: message
  TabB->>TabB: trigger core.other_window_input

  TabA->>TabA: spreadOutput()
  TabA->>BC: postMessage core.output_ready
  BC->>TabB: message
  TabB->>TabB: trigger core.other_window_output
```

## Delegação de sessão e histórico

Métodos públicos do Bot delegam ao `BotSessionAdapter` (Libs). Após persistência, disparam eventos de histórico.

```mermaid
flowchart LR
  Bot["Bot.addToHistory / rebuildHistory / renewSession"]
  Adapter["BotSessionAdapter"]
  SM["SessionManager"]
  EE["eventEmitter"]

  Bot --> Adapter --> SM
  Bot -.->|await| SM
  SM -.->|encrypt via Worker| CW["CriptoWorker"]
  Bot --> EE
  EE -->|"core.history_added / loaded / cleared / renewed"| Plugins["Plugins & Core UI"]
```

## Papel do Bot no fluxo de uma mensagem (resumo)

```mermaid
stateDiagram-v2
  [*] --> Idle: constructor + loadPlugins
  Idle --> Listening: core.loaded / all_ui_loaded
  Listening --> InputRecorded: core.input
  InputRecorded --> BackendPending: core.send_to_backend
  BackendPending --> BackendPending: fila se calling_backend
  BackendPending --> ResponseReady: payload.trigger (ex. input_text.receiver)
  ResponseReady --> OutputBroadcast: core.spread_output
  OutputBroadcast --> Listening: core.output_ready consumido
```

O diagrama detalhado de **input → backend → output** está em [02-core.md](./02-core.md). Plugins e Libs estendem os pontos de contato nas abas [03-plugins.md](./03-plugins.md) e [04-libs.md](./04-libs.md).
