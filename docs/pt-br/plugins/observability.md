##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](../README.md) / [plugins](../plugins.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./observability.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../en-us/plugins/observability.md)

</div>


# Plugin de Observability

Plugin de **output passivo** que instrumenta o barramento de eventos do Hands for Bots com [Semantic Event Observability](../../handsforbots/Libs/SemanticEventObservability/README.md). Não renderiza UI de chat — apenas configura logs, métricas e tracing semântico.

## Configuração

```javascript
bot_settings.plugins.push({
  type: 'output',
  plugin: 'Observability',
  environment: 'production',
  sampleRate: 0.2,
  maxEventsPerMinute: 120,
  exporters: ['memory', 'devPanel', 'faro', 'otel', 'langfuse', 'langsmith'],
  exporterConfig: {
    devPanel: { enabled: false },
    langfuse: { project: 'meu-app' },
    langsmith: { projectName: 'meu-app' },
  },
})
```

### Opções

| Opção | Descrição | Padrão |
|-------|-----------|--------|
| `enabled` | Ativa/desativa instrumentação | `true` |
| `environment` | Ambiente nos eventos | `production` |
| `sampleRate` | Amostragem 0–1 | `1` |
| `maxEventsPerMinute` | Limite anti-flood | `120` |
| `maxPayloadBytes` | Truncamento de payload | `2048` |
| `exporters` | Lista de exporters | `memory`, `devPanel` |
| `exporterConfig` | Config por exporter | `{}` |
| `wrapListeners` | Instrumentar callbacks `on()` | `false` |
| `instrumentBroadcastChannel` | Instrumentar sync entre abas | `true` |

Dependências externas (Faro, OTel, Langfuse, LangSmith) são **opcionais** — ausência não quebra o bot.

## Painel de debug local

```javascript
localStorage.setItem('semantic-event-observability:debug', 'true')
location.reload()
```

## API em runtime

Após o plugin carregar:

```javascript
bot.observability.getTimeline()
bot.observability.record('meu.evento', { foo: 'bar' })
```

## Grafana

Importe o dashboard em `handsforbots/Libs/SemanticEventObservability/grafana/semantic-event-observability.json`.

Documentação completa da lib: [`SemanticEventObservability/README.md`](../../handsforbots/Libs/SemanticEventObservability/README.md).
