# Fluxo — Core

O **Core** inclui canais de entrada/saída (`Core/Input`, `Core/Output`), motores em `Core/Backend` e o orquestrador [`BotOrchestrator.js`](../handsforbots/Core/BotOrchestrator.js), que concentra fila, histórico, MCP e integração com o backend.

## Mapa de módulos Core

```mermaid
flowchart TB
  subgraph Input["Core/Input"]
    TIN["Text"]
    VIN["Voice"]
    POK["Poke"]
  end

  subgraph Output["Core/Output"]
    TOUT["Text"]
    VOUT["Voice"]
    CMD["BotsCommands"]
  end

  subgraph Backend["Core/Backend"]
    RASA["Rasa"]
    OAI["OpenAI"]
    OLL["InsecureLocalOllama"]
    ULLM["UniversalLLM"]
  end

  ORCH["BotOrchestrator"]

  Input -->|"core.input, core.send_to_backend"| ORCH
  ORCH --> Backend
  Backend --> ORCH
  ORCH -->|"core.output_ready"| Output
  CMD -->|"core.action_success"| Backend
```

## Fluxo principal: mensagem do usuário até a UI

Exemplo canônico: **Text input** (`Core/Input/Text/Text.js`).

```mermaid
sequenceDiagram
  participant User as Usuário
  participant TextIn as Core Input Text
  participant EE as eventEmitter
  participant Bot as Bot.js handlers
  participant Orch as BotOrchestrator
  participant Hist as SessionAdapter
  participant BE as Backend
  participant MCP as MCPHelper
  participant TextOut as Core Output Text
  participant Others as Outros ui_outputs

  User->>TextIn: input(payload)
  TextIn->>EE: trigger core.input
  EE->>Bot: on core.input
  Bot->>Orch: input()
  Orch->>Hist: await addToHistory(input)
  Orch->>EE: core.input_received
  TextIn->>EE: trigger core.send_to_backend<br/>{plugin, payload, trigger: input_text.receiver}

  EE->>Bot: on core.send_to_backend
  Bot->>Orch: sendToBackend()

  alt calling_backend === true
    Orch->>Orch: addToQueue(payload)
  else redirectInput definido
    Orch->>Others: outputs[plugin].redirectedInput()
    Orch->>EE: trigger payload.trigger
  else chamada normal
    Orch->>EE: core.calling_backend
    Orch->>BE: await send(plugin, payload)
    BE-->>Orch: messages JSON
    Orch->>MCP: await processIfHasTools(response)
    MCP-->>Orch: messages (+ inlineContent?)
    opt inlineContent MCP
      Orch->>Orch: processInlineContent → spreadOutput
    end
    Orch->>EE: core.backend_responded
    Orch->>EE: trigger input_text.receiver [messages]
  end

  EE->>TextIn: on input_text.receiver
  TextIn->>EE: trigger core.spread_output [response]
  EE->>Bot: on core.spread_output
  Bot->>Orch: spreadOutput()
  Orch->>Orch: extractActions [•…•]
  Orch->>Hist: addToHistory(output)
  Orch->>EE: core.output_ready [payload]
  EE->>TextOut: output(payload)
  EE->>Others: listeners (Voice, BotsCommands, plugins…)
```

## Fila assíncrona do backend

Garante **uma requisição ativa** por vez; mensagens extras esperam em `bot.queue`.

```mermaid
flowchart TD
  A["core.send_to_backend"] --> B{"calling_backend?"}
  B -->|sim| C["queue.push(payload)"]
  B -->|não| D["calling_backend = true"]
  D --> E["await backend.send()"]
  E --> F["await mcpHelper.processIfHasTools()"]
  F --> G["calling_backend = false"]
  G --> H["trigger core.backend_responded"]
  H --> I{"queue.length > 0?"}
  I -->|sim| J["shift() → sendToBackend()"]
  I -->|não| K["trigger payload.trigger"]
  C --> L["aguarda backend_responded"]
  L --> I
```

## `spreadOutput` e action tags

```mermaid
flowchart LR
  PO["payload (array de mensagens)"] --> EX["extractActions()"]
  EX --> TAG{"text contém [• … •]?"}
  TAG -->|sim| SPLIT["obj.text limpo + obj.do = JSON comando"]
  TAG -->|não| HIST["addToHistory(output)"]
  SPLIT --> HIST
  HIST --> E1["core.output_ready"]
  E1 --> TOUT["Text.output"]
  E1 --> VOUT["Voice.output"]
  E1 --> CMD["BotsCommands.output"]
  E1 --> PLG["Plugins output"]
```

Tags padrão definidas no Bot: `action_tag_open = '[•'`, `action_tag_close = '•]'`.

## BotsCommands — loop de ação assíncrona

[`Core/Output/BotsCommands/BotsCommands.js`](../handsforbots/Core/Output/BotsCommands/BotsCommands.js) escuta `core.output_ready`, executa `obj.do` e devolve resultado ao motor.

```mermaid
sequenceDiagram
  participant Orch as BotOrchestrator
  participant CMD as BotsCommands
  participant Plugin as Output plugin
  participant EE as eventEmitter
  participant BE as Backend

  Orch->>EE: core.output_ready (com obj.do)
  EE->>CMD: output(payload)
  CMD->>CMD: JSON.parse(obj.do)
  CMD->>Plugin: fn(params) Promise
  Plugin-->>CMD: result
  CMD->>EE: core.action_success
  EE->>BE: actionSuccess(response)
  Note over BE: OpenAI/UniversalLLM implementam;<br/>Rasa/Ollama são no-op
```

Após `core.all_ui_loaded`, o BotsCommands reexecuta comandos do histórico (`rebuildHistory` local do plugin).

## Canais de entrada — padrões de contato

| Canal | Dispara | `trigger` customizado | Observação |
|-------|---------|----------------------|------------|
| **Text** | `core.input` + `core.send_to_backend` | `input_text.receiver` | Fluxo completo com histórico |
| **Voice** | Indireto: preenche `#chat_input` e clica submit | (via Text) | `proccessResults` → submit do form Text |
| **Poke** | só `core.send_to_backend` | `poke.receiver` | Fila interna até `backend` existir |
| **Photo** (plugin) | só `core.send_to_backend` | `photo.receiver` | Sem `core.input` |

### Voice — encadeamento com Text

```mermaid
flowchart LR
  SR["SpeechRecognition / VoskConnector"] --> VR["Voice.proccessResults"]
  VR --> UI["#chat_input + #chat_submit.click"]
  UI --> TXT["Text.input()"]
  TXT --> EE["core.input + core.send_to_backend"]
```

Libs de voz: `SpeechRecognition.js` (nativo) ou `VoskConnector.js` (WebSocket).

### Poke — espera pelo backend

```mermaid
sequenceDiagram
  participant Poke as Poke input
  participant BE as backend

  Poke->>Poke: input(payload) → queue
  alt backend undefined
    Poke->>Poke: setTimeout 300ms retry
  else backend pronto
    loop queue
      Poke->>Poke: core.send_to_backend (poke.receiver)
    end
  end
```

## Backends — contrato `send()`

Todos expõem `async send(plugin, payload)` e retornam array de mensagens estilo Rasa (`recipient_id`, `text`, `image`, `buttons`…).

```mermaid
flowchart TB
  Orch["sendToBackend"] --> BE{"options.engine"}
  BE -->|rasa / default| R["Rasa.js → fetch POST"]
  BE -->|openai| O["OpenAI.js"]
  BE -->|insecure-local-ollama| L["InsecureLocalOllama.js"]
  BE -->|universal-llm| U["UniversalLLM.js + BackendSessionManager"]
  R & O & L & U --> JSON["await response.json()"]
  JSON --> MCP["MCPHelper.processIfHasTools"]
```

`UniversalLLM` usa [`BackendSessionManager`](../handsforbots/Libs/BackendSessionManager.js) para sessão no servidor; os demais, em geral, são stateless por requisição (Rasa mantém sessão no servidor via `sender`).

## MCP no orchestrator

```mermaid
flowchart TD
  R["Resposta do backend"] --> MCP["MCPHelper.processIfHasTools"]
  MCP --> TC{"tool calls?"}
  TC -->|sim| EX["executeToolCalls (async)"]
  EX --> IC["inlineContent[]"]
  IC --> SO["spreadOutput (mensagens inline)"]
  TC -->|não| MSG["return messages"]
  EX --> FB["mcp.tool_feedback_received"]
  FB --> HF["handleToolFeedback → spreadOutput feedback"]
```

Registro de tools na carga do plugin: `registerPluginMCPItems` → `MCPHelper.registerTool/Model/Function`.

## Eventos Core (ciclo de vida UI)

```mermaid
stateDiagram-v2
  [*] --> LoadingPlugins: loadPlugins
  LoadingPlugins --> BuildingUI: dynamic import OK
  BuildingUI --> CountingUI: cada plugin.ui()
  CountingUI --> CountingUI: core.ui_loaded
  CountingUI --> AllUI: loaded_ui_count == ui_count
  AllUI --> HistoryReady: rebuildHistory
  AllUI --> BotsCmdReplay: core.all_ui_loaded → BotsCommands
  HistoryReady --> Running: core.history_loaded
  Running --> Running: input/output cycles
```

## Redirecionamento de input (`core.redirect_input`)

Quando `bot.redirectInput` está definido, `sendToBackend` **não** chama o motor: encaminha o payload para `outputs[plugin].redirectedInput()` e dispara o `trigger` do payload original. Usado por fluxos guiados (ex. GUIDed) que consomem entrada localmente.
