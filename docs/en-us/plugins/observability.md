##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; docs home](../README.md) / [plugins](../plugins.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](../../pt-br/plugins/observability.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./observability.md)

</div>


# Observability Plugin

Passive **output plugin** that instruments the Hands for Bots event bus via [Semantic Event Observability](../../handsforbots/Libs/SemanticEventObservability/README.md). It does not render chat UI — it only configures semantic logs, metrics, and tracing.

## Scope

This plugin monitors **how the bot behaves while it is running** — not **whether it is up**.

| In scope | Out of scope (other stack) |
|----------|----------------------------|
| Turn and phase latency (`sevo_*`) | Uptime / synthetic HTTP probes |
| Orchestrator queue and backend phase | Backend `/health` (e.g. Rasa `/api/health`) |
| Abandoned turns, flow errors | Kubernetes liveness/readiness |
| Telemetry export failures | “Application is down” alerting |

Absence of Grafana data does not prove an outage — export may be off, sampled, or the LGTM stack may be down. For functional degradation, watch `sevo_turns_total`, queue gauges, and `sevo_exporter_errors_total`.

Details: [library scope](../../handsforbots/Libs/SemanticEventObservability/docs/architecture.md#scope) · [adapter](../../handsforbots/Libs/SemanticEventObservability/docs/handsforbots-adapter.md#scope).

## Configuration

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
    langfuse: { project: 'my-app' },
    langsmith: { projectName: 'my-app' },
  },
})
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Enable/disable instrumentation | `true` |
| `environment` | Environment label on events | `production` |
| `sampleRate` | Sampling ratio 0–1 | `1` |
| `maxEventsPerMinute` | Anti-flood limit | `120` |
| `maxPayloadBytes` | Payload truncation | `2048` |
| `exporters` | Exporter list | `memory`, `devPanel` |
| `exporterConfig` | Per-exporter config | `{}` |
| `wrapListeners` | Instrument `on()` callbacks | `false` |
| `instrumentBroadcastChannel` | Instrument cross-tab sync | `true` |

External dependencies (Faro, OTel, Langfuse, LangSmith) are **optional** — missing packages never break the bot.

## Local debug panel

```javascript
localStorage.setItem('semantic-event-observability:debug', 'true')
location.reload()
```

## Runtime API

After the plugin loads:

```javascript
bot.observability.getTimeline()
bot.observability.record('my.event', { foo: 'bar' })
```

## Grafana

Import the dashboard from `handsforbots/Libs/SemanticEventObservability/grafana/semantic-event-observability.json`.

## Roadmaps

| Document | Scope |
|----------|-------|
| [Library roadmap & abstractions](../../handsforbots/Libs/SemanticEventObservability/docs/roadmap.md) | Host-agnostic lib plan |
| [Metrics checklist (`sevo_*`)](../../handsforbots/Libs/SemanticEventObservability/docs/metrics-roadmap.md) | Library metrics |
| [Hands for Bots roadmap (`hfb_*`)](../../handsforbots/Libs/SemanticEventObservability/docs/handsforbots-roadmap.md) | HfB-specific work |

Full library docs: [`SemanticEventObservability/README.md`](../../handsforbots/Libs/SemanticEventObservability/README.md).
