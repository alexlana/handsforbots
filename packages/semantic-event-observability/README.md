# Semantic Event Observability

Semantic observability for async event systems: logs, metrics, and tracing with **optional** exporters.

Built to sit on top of proven stacks (OpenTelemetry, Grafana Faro, Langfuse, LangSmith). If an exporter dependency is missing, the host application keeps working — telemetry is simply skipped for that backend.

**Scope:** semantic flow observability (turns, phases, queue pressure, telemetry health) — **not** service uptime, `/health` endpoints, or K8s probes. See [architecture — scope](./docs/architecture.md#scope).

> **Working title.** The npm name lives in `packageIdentity.js`. Change `PACKAGE_SLUG` there when the final product name is decided.

## Quick start (Hands for Bots)

Add the **Observability** output plugin:

```javascript
bot_settings.plugins.push({
  type: 'output',
  plugin: 'Observability',
  environment: 'development',
  exporters: ['memory', 'devPanel'],
})
```

Enable the dev panel:

```javascript
localStorage.setItem('semantic-event-observability:debug', 'true')
location.reload()
```

Configure exporters and policy via plugin options:

```javascript
{
  type: 'output',
  plugin: 'Observability',
  environment: 'production',
  sampleRate: 0.2,
  maxEventsPerMinute: 120,
  exporters: ['memory', 'devPanel', 'faro', 'otel', 'langfuse', 'langsmith'],
  exporterConfig: {
    faro: { /* optional injected client */ },
    otel: { /* api: injected OpenTelemetry API */ },
    langfuse: { project: 'my-app' },
    langsmith: { projectName: 'my-app' },
  },
}
```

## Generic event bus

```javascript
import { createObservability, instrumentEventBus } from './index.js'

const observability = createObservability({
  turnStartEvents: ['user.message'],
  turnEndEvents: ['bot.response'],
  exporters: ['memory', 'console', 'otel'],
})

instrumentEventBus(observability, myBus, {
  stateProvider: () => ({ queueDepth: myQueue.length }),
})
```

## Exporters

| ID | Dependency | Destination |
|----|------------|-------------|
| `memory` | none | Ring buffer / debug export |
| `console` | none | Browser console |
| `devPanel` | none | Floating debug panel |
| `otel` | `@opentelemetry/api` (optional) | Tempo / Mimir via OTel collector |
| `faro` | `@grafana/faro-web-sdk` (optional) | Loki via Faro collector |
| `langfuse` | `@langfuse/tracing` (optional) | Langfuse traces |
| `langsmith` | `langsmith` (optional) | LangSmith runs |
| `webVitals` | `web-vitals` (optional) | Core Web Vitals → `sevo_web_vital` |

Dependencies are **optional peer dependencies**. Inject clients manually when dynamic import is not available:

```javascript
exporterConfig: {
  faro: { client: window.faro },
  otel: { api: traceApi },
  langfuse: { startObservation },
  langsmith: { RunTree },
}
```

## Security defaults

- Payload redaction via denylist (`password`, `token`, `history`, …)
- Payload truncation (`maxPayloadBytes`, default 2 KB)
- Per-minute rate limit (`maxEventsPerMinute`, default 120)
- Sampling (`sampleRate`, default 1 in dev — lower in production)
- Turn events are never sampled out

Defense in depth: also rate-limit at the collector before Loki/Tempo.

## Grafana

| File | Use |
|------|-----|
| `grafana/semantic-event-observability.json` | Import template (select Loki/Tempo/Prometheus datasources) |
| `grafana/semantic-event-observability.lgtm.json` | Pre-provisioned in [`examples/`](../../examples/) via `docker-compose.observability.yml` |
  
The example stack mounts the `.lgtm.json` variant into `grafana/otel-lgtm` and sets it as the home dashboard.

## Documentation

- [Getting started](./docs/getting-started.md)
- [Architecture](./docs/architecture.md)
- [Library roadmap & abstractions](./docs/roadmap.md)
- [Metrics checklist (`sevo_*`)](./docs/metrics-roadmap.md)
- [Exporters](./docs/exporters.md)
- [Tail sampling guidance](./docs/tail-sampling.md)
- [Grafana dashboard validation](./docs/grafana-validation.md)
- [Custom exporter cookbook](./docs/custom-exporter.md)
- [Publishing to npm](./docs/publishing.md)
- [Hands for Bots adapter](./docs/handsforbots-adapter.md)
- [Hands for Bots roadmap (`hfb_*`)](./docs/handsforbots-roadmap.md)
- [Renaming the package](./docs/renaming.md)

## Future npm publish

See [publishing.md](./docs/publishing.md). TypeScript types ship in `index.d.ts`.
