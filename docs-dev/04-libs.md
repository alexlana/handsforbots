# Fluxo — Libs

Bibliotecas em [`handsforbots/Libs/`](../handsforbots/Libs/) fornecem infraestrutura transversal: eventos, sessão, criptografia, MCP, voz e utilitários. O Bot e o Core **não duplicam** essa lógica — delegam via adapters e imports.

## Mapa de dependências

```mermaid
flowchart TB
  Bot["Bot.js"]

  Bot --> EE["EventEmitter.js"]
  Bot --> WSA["BotSessionAdapter.js"]
  Bot --> MCP["MCPHelper.js"]
  Bot --> CK["CryptoKeys.js"]
  Bot --> WS["WebStorage.umd.min.js"]
  Bot --> CW["CriptoWorker.js"]

  WSA --> SM["SessionManager.js"]
  SM --> CK
  SM --> WS
  SM --> CW

  CoreVoice["Core Input Voice"] --> ED["EnvironmentDetection.js"]
  CoreVoice --> SR["SpeechRecognition.js"]
  CoreVoice --> VC["VoskConnector.js"]
  VC --> VRemote["Vosk/Remote/*"]
  VC --> VLocal["Vosk/InBrowser/*"]

  ULLM["UniversalLLM backend"] --> BSM["BackendSessionManager.js"]

  Plugins --> EE
  Plugins --> SEO["SemanticEventObservability"]
  Bot --> SEO
```

## Semantic Event Observability

Biblioteca em [`handsforbots/Libs/SemanticEventObservability/`](../handsforbots/Libs/SemanticEventObservability/) — observabilidade semântica para barramentos de eventos assíncronos.

| Componente | Função |
|------------|--------|
| `createObservability()` | Core: policy, correlation, buffer, exporters |
| `adapters/handsforbots.js` | Integração via plugin `Observability` |
| `adapters/genericEventBus.js` | Wrapper genérico `on` / `trigger` |
| `exporters/*` | Faro, OTel, Langfuse, LangSmith (todos opcionais) |
| `grafana/*.json` | Dashboard template para LGTM stack |

Dependências externas são **peer optional** — ausência não quebra o bot. Cobre fluxo conversacional (`sevo_*`: turnos, fases, fila, saúde da telemetria) — **não** uptime, `/health` de backend nem probes de plataforma; ver [escopo](../handsforbots/Libs/SemanticEventObservability/docs/architecture.md#scope). Roadmaps: [lib](../handsforbots/Libs/SemanticEventObservability/docs/roadmap.md) · [métricas sevo_*](../handsforbots/Libs/SemanticEventObservability/docs/metrics-roadmap.md) · [Hands for Bots](../handsforbots/Libs/SemanticEventObservability/docs/handsforbots-roadmap.md).

## EventEmitter — barramento in-process

Implementação leve (namespace + callbacks). **Síncrono**: `trigger` executa todos os listeners antes de retornar.

```mermaid
flowchart LR
  T["trigger('core.input', [data])"] --> R["resolveNames"]
  R --> C["callbacks[namespace][value]"]
  C --> L1["listener 1"]
  C --> L2["listener 2"]
  C --> LN["listener N"]
```

| API | Uso |
|-----|-----|
| `on(name, fn)` | Registrar (Bot, plugins, orchestrator indireto) |
| `trigger(name, args)` | Disparar — args é array passado ao listener |
| `off(name)` | Remover (ex. Voice durante `ignore()`) |

**Importante:** erros em um listener podem interromper a cadeia; não há fila de eventos separada da fila de backend (`bot.queue`).

## Sessão e histórico — cadeia assíncrona

```mermaid
sequenceDiagram
  participant Orch as BotOrchestrator
  participant Bot as Bot
  participant Ad as BotSessionAdapter
  participant SM as SessionManager
  participant CW as CriptoWorker
  participant LS as localStorage

  Orch->>Bot: addToHistory(type, plugin, payload)
  Bot->>Ad: addToHistory()
  Ad->>SM: addToHistory()
  SM->>SM: history = [...history, item]
  SM->>CW: postMessage encrypt
  CW-->>SM: ciphertext
  SM->>LS: WebStorage.set
  Bot->>Bot: trigger core.history_added

  Note over Orch,LS: rebuildHistory (startup)
  Orch->>Bot: rebuildHistory()
  Bot->>Ad: rebuildHistory()
  Ad->>SM: load + decrypt
  SM-->>Bot: trigger core.history_loaded
```

### SessionManager vs BackendSessionManager

| Componente | Quando | Storage |
|------------|--------|---------|
| **SessionManager** | `storage_side !== 'backend'` | `localStorage` + criptografia |
| **BackendSessionManager** | UniversalLLM / APIs com sessão servidor | Cookies / headers / invalidate via API |

Ver [`Libs/README_SessionManagers.md`](../handsforbots/Libs/README_SessionManagers.md).

### Timeout de sessão

```mermaid
flowchart TD
  INT["Interação do usuário"] --> REN["core.renew_session opcional"]
  REN --> SM2["SessionManager.renewSession"]
  CHK["checkSessionExpired"] --> EXP{"> session_timeout?"}
  EXP -->|sim| CLR["clearSession → core.history_cleared"]
  EXP -->|não| OK["continua"]
```

## Criptografia — Web Worker

```mermaid
flowchart LR
  SM["SessionManager.encrypt/decrypt"]
  CW["CriptoWorker.js (module Worker)"]
  CK["CryptoKeys + WebStorage"]

  SM -.->|postMessage async| CW
  CW -.->|result| SM
  CK --> LS2["chave em localStorage"]
```

O Bot instancia o worker uma vez no constructor:

`new Worker('./Libs/CriptoWorker.js', { type: 'module' })`

## MCPHelper — pós-processamento do backend

```mermaid
flowchart TD
  subgraph Registro["Na carga do plugin"]
    P["Plugin.isMCPTool"] --> R["registerTool / Model / Function"]
    R --> T["bot.mcp.available*"]
  end

  subgraph Runtime["Após send()"]
    RES["response backend"] --> E["extractToolCalls"]
    E --> X{"há tools?"}
    X -->|sim| EX["executeToolCalls (await)"]
    EX --> PL["plugin tool.execute"]
    EX --> IC["inlineContent"]
    X -->|não| OUT["return response"]
    PL --> FB["trigger mcp.tool_feedback_received"]
  end
```

O orchestrator chama `processIfHasTools` **antes** de disparar o `trigger` do plugin de entrada e **depois** pode chamar `spreadOutput` adicional para conteúdo inline.

## Stack de voz

```mermaid
flowchart TB
  VIN["Core Input Voice"]
  ED["EnvironmentDetection"]
  VIN --> ED
  ED --> NAT{"SpeechRecognition nativo?"}
  NAT -->|sim| SR["Libs/SpeechRecognition.js"]
  NAT -->|não| VK["Libs/VoskConnector.js"]
  VK --> WSS["wss://…/vosk"]
  VK --> AW["VoiceClientWithAudioWorklet"]
  VK --> SP["VoiceClientWithScriptProcessor"]
  SR & VK --> EE2["eventEmitter local"]
  EE2 -->|"result"| PROC["Voice.proccessResults"]
  PROC --> TXT["Text form submit"]
```

Eventos auxiliares de voz no bot global: `speaking_start`, `speaking_end`, `speechstart`, `speechend`, `start`, `stop` (coordenação com output Voice).

## Outras Libs (papel no fluxo)

| Arquivo | Contato com Bot/Core | Função assíncrona |
|---------|----------------------|-------------------|
| `TextHelper.js` | Utilitário | Helpers de texto |
| `MCPHelper.js` | Bot + Orchestrator | `await executeToolCalls` |
| `EnvironmentDetection.js` | Voice input | Escolha SR vs Vosk |
| `js.cookie.min.js` | Backends | Cookies de sessão |
| `WebStorage.umd.min.js` | Bot, SessionManager | Persistência key-value |

## BroadcastChannel + EventEmitter

Duas camadas de “broadcast”:

```mermaid
flowchart TB
  subgraph Tab["Mesma aba"]
    EE["EventEmitter — síncrono"]
  end

  subgraph Cross["Entre abas"]
    BC["BroadcastChannel 'bot'"]
  end

  Orch --> EE
  Orch --> BC
  BC --> EE2["outra aba: core.other_window_*"]
```

| Mensagem BC | Evento na outra aba |
|-------------|---------------------|
| `core.input_received` | `core.other_window_input` |
| `core.output_ready` | `core.other_window_output` |

## Diagrama integrado Libs ↔ Bot ↔ Core

```mermaid
sequenceDiagram
  participant Plugin
  participant EE as EventEmitter
  participant Orch as BotOrchestrator
  participant MCP as MCPHelper
  participant BE as Backend
  participant SM as SessionManager
  participant CW as CriptoWorker

  Plugin->>EE: core.send_to_backend
  EE->>Orch: sendToBackend
  Orch->>SM: addToHistory (input)
  SM->>CW: encrypt
  Orch->>BE: fetch await
  BE-->>Orch: JSON
  Orch->>MCP: processIfHasTools await
  MCP-->>Orch: messages
  Orch->>EE: plugin.receiver
  Plugin->>EE: core.spread_output
  Orch->>SM: addToHistory (output)
  Orch->>EE: core.output_ready
```

Este é o caminho completo onde **Libs** entram em persistência (SessionManager + Worker) e em pós-processamento (MCPHelper), enquanto **Core/Plugins** definem UI e contratos de evento.
