# Getting started

## Library vs Hands for Bots

Semantic Event Observability is **host-agnostic**. Hands for Bots is one integration path.

| Path | Doc |
|------|-----|
| Any `on` / `trigger` event bus | § Generic bus below |
| Hands for Bots plugin | § 1. Enable in Hands for Bots |
| Custom backend exporter | [custom-exporter.md](./custom-exporter.md) |
| Roadmap & abstractions | [roadmap.md](./roadmap.md) |

## Generic bus (framework-agnostic)

Use this path for React, Vue, Node event emitters, or any object with `on()` + `trigger()`.

### 1. Install

```bash
npm i @handsforbots/semantic-event-observability
# optional peers for Grafana stack:
npm i @opentelemetry/api @grafana/faro-web-sdk
```

### 2. Configure turn boundaries and phases

```javascript
import {
  createObservability,
  defineTurnModel,
  definePhaseModel,
  instrumentEventBus,
  SEVO_METRICS,
} from '@handsforbots/semantic-event-observability'

const observability = createObservability({
  environment: 'production',
  turn: defineTurnModel({
    start: ['user.message'],
    end: ['bot.response'],
  }),
  phases: definePhaseModel([
    { id: 'backend', startEvent: 'api.call', endEvent: 'api.done' },
  ]),
  exporters: ['memory', 'console'],
  // optional: reduce noise on high-volume buses
  eventAllowlist: ['user.message', 'api.call', 'api.done', 'bot.response'],
})

instrumentEventBus(observability, myBus, {
  stateProvider: () => ({ queueDepth: myQueue.length }),
})

await observability.init()
```

Turn detection **always runs** even when `eventAllowlist` filters recording. Metrics use the `sevo_*` prefix (`SEVO_METRICS.TURN_DURATION`, etc.).

### 3. Manual phases and trace propagation

```javascript
myBus.trigger('user.message', [{ text: 'hello' }])

observability.startPhase('fetch')
await observability.withFetch('/api/chat', { method: 'POST', body: JSON.stringify({ text: 'hello' }) })
observability.endPhase('fetch')

myBus.trigger('bot.response', [{ text: 'hi there' }])
```

`withFetch` / `getTraceHeaders()` inject active turn trace context for backend correlation.

### 4. Inspect locally

```javascript
observability.getTimeline()      // recent semantic events
observability.getMetrics()       // sevo_* metric records
observability.getExporterStatus()
observability.getPolicyStats()
```

### 5. Add Grafana (optional)

Wire OTel + Faro in your app shell, then:

```javascript
createObservability({
  exporters: ['memory', 'faro', 'otel'],
  exporterConfig: {
    otel: {
      getTracer: stack.getTracer,
      getMeter: stack.getMeter,
      traceApi: stack.traceApi,
    },
    faro: { client: faro },
  },
})
```

See [exporters.md](./exporters.md) and the Vite example in `examples/OBSERVABILITY.md`.

### 6. Custom exporter

```javascript
await observability.registerExporter({
  id: 'webhook',
  available: true,
  onEvent(event) { /* send to your API */ },
})
```

Full walkthrough: [custom-exporter.md](./custom-exporter.md).

---

## 1. Enable in Hands for Bots

Register the Observability output plugin:

```javascript
bot_settings.plugins.push({
  type: 'output',
  plugin: 'Observability',
})
```

Omit the plugin (or set `enabled: false`) to disable observability entirely.

## 2. Dev panel (local triage)

```javascript
localStorage.setItem('semantic-event-observability:debug', 'true')
location.reload()
```

The panel shows recent semantic events and exports a sanitized JSON bundle. Full analysis belongs in Grafana.

## 3. Production stack (Grafana LGTM)

1. Install and init **Grafana Faro** in your app shell (optional but recommended).
2. Install **OpenTelemetry browser SDK** if you want Tempo traces (optional).
3. Configure the plugin:

```javascript
{
  type: 'output',
  plugin: 'Observability',
  environment: 'production',
  sampleRate: 0.1,
  maxEventsPerMinute: 60,
  exporters: ['memory', 'faro', 'otel'],
}
```

4. Run a collector with auth + rate limiting in front of Loki/Tempo.
5. Import the dashboard from `grafana/semantic-event-observability.json`.

## 4. Langfuse / LangSmith (optional)

```javascript
{
  type: 'output',
  plugin: 'Observability',
  exporters: ['memory', 'langfuse', 'langsmith'],
  exporterConfig: {
    langfuse: { project: 'handsforbots' },
    langsmith: { projectName: 'handsforbots' },
  },
}
```

Install optional packages in the host app:

```bash
npm i @langfuse/tracing langsmith
```

If packages are absent, those exporters stay inactive — no runtime error.

## 5. Debug API on `window`

After the plugin loads:

```javascript
window.__SEMANTIC_EVENT_OBSERVABILITY__
// .getTimeline()
// .getExporterStatus()
// .getPolicyStats()
```

See [renaming.md](./renaming.md) for how the global key changes with the package slug.
