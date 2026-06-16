# Custom exporter cookbook

Build a custom exporter when you need to send semantic events or `sevo_*` metrics to a backend that is not covered by the built-ins (Faro, OTel, Langfuse, LangSmith).

## Interface

Every exporter implements:

```javascript
{
  id: 'myBackend',           // unique string
  available: false,        // set true in init() when ready
  description: '...',      // optional, shown in getExporterStatus()
  async init(context) {},   // receive identity, buffer, metricsRegistry, traceContextBridge
  onEvent(event) {},        // semantic events (turn, phase, bus.trigger, custom)
  onMetric(metric) {},      // sevo_* metrics from MetricsRegistry
  onPhaseEnd(event) {},     // optional — phase.end only
  destroy() {},             // optional cleanup
}
```

`init(context)` receives:

| Field | Use |
|-------|-----|
| `context.identity` | Package slug, OTel service name |
| `context.metricsRegistry` | Subscribe or inspect canonical metrics |
| `context.traceContextBridge` | Active turn trace propagation |
| `context.getTimeline()` | Recent events (memory buffer) |
| `context.getMetrics()` | Recent metric records |
| `context.isError(event)` | Default error heuristic |

## Minimal example

```javascript
import { createObservability } from '@handsforbots/semantic-event-observability'

const myExporter = {
  id: 'webhook',
  available: false,
  description: 'POST semantic events to internal API',

  async init(context) {
    this.endpoint = context.identity.otelServiceName // or from config
    this.available = Boolean(this.endpoint)
  },

  onEvent(event) {
    if (event.type === 'turn.end') {
      fetch('/telemetry/turns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          turnId: event.turnId,
          durationMs: event.durationMs,
          name: event.name,
        }),
      }).catch(() => {})
    }
  },

  onMetric(metric) {
    // metric.name is sevo_* ; metric.type is histogram | counter | gauge
  },
}

const observability = createObservability({
  turnStartEvents: ['user.message'],
  turnEndEvents: ['bot.response'],
  exporters: ['memory'],
})

await observability.init()
await observability.registerExporter(myExporter)
```

## Register after init

Use `registerExporter()` to attach custom exporters at runtime. The lib calls `init()` with the same context as built-in exporters.

```javascript
const status = await observability.registerExporter(myExporter)
console.log(status) // { id: 'webhook', available: true }
```

You can also push directly before `init()` if you manage lifecycle yourself:

```javascript
observability.exporters.push(myExporter)
await observability.init()
```

## Phase hooks

`onPhaseEnd` fires for every `phase.end` semantic event — bus-driven phases, manual `startPhase`/`endPhase`, and computed render phase.

```javascript
onPhaseEnd(event) {
  console.log(event.phase, event.durationMs, event.source) // bus | manual | computed
}
```

## Metrics-only exporter

If you only care about Prometheus-style metrics, implement `onMetric` and skip `onEvent`:

```javascript
const metricsSink = {
  id: 'metrics-log',
  available: true,
  onMetric(metric) {
    console.log(metric.name, metric.value, metric.labels)
  },
}
```

Canonical names are in `SEVO_METRICS` (`sevo_turn_duration_ms`, `sevo_phase_duration_ms`, etc.).

## Error handling

Exporter handlers run inside try/catch. Uncaught errors increment `sevo_exporter_errors_total{exporter="your-id"}`. Keep handlers small and swallow expected network failures.

## Production checklist

- [ ] Set `available: false` until `init()` confirms dependencies
- [ ] Respect host sampling — do not bypass `Policy`
- [ ] Avoid PII in `onEvent`; use `payloadSummary` fields when present
- [ ] Use host-prefixed metric names for product analytics (`hfb_*`), not `sevo_*`
- [ ] Call `destroy()` to flush timers or close connections

## See also

- [exporters.md](./exporters.md) — built-in exporters
- [metrics-roadmap.md](./metrics-roadmap.md) — `sevo_*` catalog
- [test/testHarness.js](../test/testHarness.js) — integration test helper
