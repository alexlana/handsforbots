# Fluxo — Plugins

Plugins customizados ficam em [`handsforbots/Plugins/`](../handsforbots/Plugins/). O Core segue a **mesma convenção** de pastas (`Input/<Nome>/<Nome>.js`, `Output/<Nome>/<Nome>.js`), mas é carregado com `source: 'Core'` no `pluginLoader`.

## Carregamento dinâmico

```mermaid
sequenceDiagram
  participant Orch as BotOrchestrator
  participant Bot as Bot
  participant Mod as Plugin module

  Note over Orch: loadPlugins()
  loop options.core
    Orch->>Orch: await pluginLoader(cfg, 'Core')
    Orch->>Mod: import ../Core/Input|Output/Name/Name.js
    Mod-->>Orch: default class
    Orch->>Bot: bot.inputs|outputs[Name] = instance
    Orch->>Orch: registerPluginMCPItems (se isMCPTool)
  end
  loop options.plugins
    Orch->>Orch: await pluginLoader(cfg, 'Plugins')
  end
  loop loadSequence
    Orch->>Mod: plugin.ui(options) → DOM
    Mod->>Bot: trigger core.ui_loaded
  end
```

Caminho de import gerado em runtime:

`../{Core|Plugins}/{Input|Output}/{PluginName}/{PluginName}.js`

## Inventário atual

| Plugin | Tipo | Papel no fluxo |
|--------|------|----------------|
| **Photo** | Input | `core.send_to_backend` → `photo.receiver` → `core.spread_output` |
| **Analytics** | Output | Escuta `core.input` e `core.output_ready` (side-effect, não altera chat) |
| **GUIDed** | Output | Tutorial GUI; pode `core.spread_output` com `force`; redirecionamento de input |
| **ImageGallery** | Output + MCP | Tool MCP para galeria |
| **ShowRelevantContent** | Output + MCP | Tool MCP para conteúdo relevante |
| **HexPresentation** | Output | Apresentação em overlay (DOM) |

## Padrão Input plugin

```mermaid
flowchart LR
  UI["ui() → DOM / câmera / botão"] --> ACT["ação do usuário"]
  ACT --> IN["input(payload)"]
  IN --> SEB["trigger core.send_to_backend<br/>{plugin, payload, trigger: plugin.receiver}"]
  SEB --> ORCH["BotOrchestrator.sendToBackend"]
  ORCH --> REC["on plugin.receiver"]
  REC --> SO["trigger core.spread_output"]
```

### Exemplo: Photo

```mermaid
sequenceDiagram
  participant Photo as Plugins/Input/Photo
  participant EE as eventEmitter
  participant Orch as BotOrchestrator

  Photo->>EE: on photo.receiver
  Photo->>Photo: input(imagem)
  Photo->>EE: core.send_to_backend
  EE->>Orch: await backend…
  Orch->>EE: photo.receiver [response]
  EE->>Photo: receiver()
  Photo->>EE: core.spread_output
```

Photo **não** dispara `core.input` — o histórico de entrada depende de outros canais ou do backend.

## Padrão Output plugin

Outputs com UI registram-se em `bot.ui_outputs` no `pluginLoader` (type `output`). Reagem a `core.output_ready` ou apenas a eventos próprios.

```mermaid
flowchart TB
  EE["core.output_ready"] --> A["Analytics.trackEvent"]
  EE --> OBS["Observability (event bus)"]
  EE --> B["ImageGallery / ShowRelevantContent"]
  EE --> C["HexPresentation DOM"]
  EE --> D["GUIDed (parcial)"]
  EE --> E["Core Text / Voice / BotsCommands"]
```

## Analytics — observador passivo

[`Plugins/Output/Analytics/Analytics.js`](../handsforbots/Plugins/Output/Analytics/Analytics.js) não participa do caminho crítico da resposta; envia eventos HTTP em paralelo.

## Observability — instrumentação do barramento

[`Plugins/Output/Observability/Observability.js`](../handsforbots/Plugins/Output/Observability/Observability.js) é um output passivo que configura [Semantic Event Observability](../handsforbots/Libs/SemanticEventObservability/README.md). Instrumenta `eventEmitter.trigger` / fila / `BroadcastChannel`; exporters opcionais (Faro, OTel, Langfuse, LangSmith). **Não** monitora uptime nem `/health` de backend — ver [escopo](../docs/pt-br/plugins/observability.md#escopo).

```javascript
options.plugins.push({
  type: 'output',
  plugin: 'Observability',
  exporters: ['memory', 'devPanel'],
})
```

```mermaid
sequenceDiagram
  participant EE as eventEmitter
  participant AN as Analytics
  participant API as Serviço externo

  EE->>AN: core.input
  AN->>API: trackEvent message_sent (fetch async)

  EE->>AN: core.output_ready
  AN->>API: trackEvent message_received
```

## GUIDed — desvio do backend

O GUIDed pode injetar mensagens sem passar pelo motor usando `core.spread_output` com segundo argumento `force` (ignora `redirectInput`).

```mermaid
flowchart TD
  U["Usuário / voz / texto"] --> G["GUIDed lógica interna"]
  G --> RI{"precisa do LLM?"}
  RI -->|não| SO["core.spread_output(payload, true)"]
  RI -->|sim| RED["core.redirect_input → GUIDed"]
  RED --> RIN["redirectedInput no output GUIDed"]
  SO --> OUT["Todos ui_outputs + histórico"]
```

## Plugins MCP (`isMCPTool`)

Plugins que definem `isMCPTool`, `getMCPToolDefinition()` etc. registram ferramentas no carregamento:

```mermaid
flowchart LR
  PL["Plugin instanciado"] --> REG["registerPluginMCPItems"]
  REG --> MCP["MCPHelper.registerTool"]
  MCP --> BE["Prompt / tool_calls no backend"]
  BE --> EX["executeToolCalls async"]
  EX --> PL2["tool.execute() no plugin"]
  PL2 --> IC["inlineContent ou feedback"]
  IC --> SO["spreadOutput / mcp.tool_feedback_received"]
```

Exemplos: `ImageGallery`, `ShowRelevantContent` (ver também [`Plugins/README_MCP_PLUGIN_PATTERN.md`](../handsforbots/Plugins/README_MCP_PLUGIN_PATTERN.md)).

## Matriz de eventos por plugin

| Plugin | Escuta | Dispara |
|--------|--------|---------|
| Photo | `photo.receiver` | `core.send_to_backend`, `core.spread_output` |
| Analytics | `core.input`, `core.output_ready` | — (HTTP externo) |
| Observability | (wrap `trigger` no bus) | — (exporters opcionais) |
| GUIDed | (interno / voz) | `core.spread_output`, possivelmente `core.redirect_input` |
| ImageGallery / ShowRelevantContent | MCP + UI | via MCPHelper após backend |
| HexPresentation | `core.output_ready` (implícito via UI) | manipulação DOM |

## Extensão: criar um plugin compatível

```mermaid
flowchart TD
  A["export default class MeuPlugin"] --> B["constructor(bot, options)"]
  B --> C["bot.eventEmitter.on(...)"]
  B --> D["ui(options) → DOM + core.ui_loaded"]
  C --> E["Input: core.send_to_backend + trigger único"]
  C --> F["Output: on core.output_ready"]
  E --> G["receiver → core.spread_output"]
  H["Opcional MCP"] --> I["isMCPTool + getMCPToolDefinition"]
```

Configuração na app:

```javascript
options.plugins.push({ plugin: 'MeuPlugin', type: 'input' /* ou output */ })
```

O nome em `plugin` deve ser alfanumérico (`sanitizePluginName`).
