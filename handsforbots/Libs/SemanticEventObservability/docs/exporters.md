# Exporters

All exporters implement the same interface:

```javascript
{
  id: string,
  available: boolean,
  description: string,
  init(context): Promise<void>,
  onEvent(event): void,
  onMetric(metric): void,
  onPhaseEnd?(phaseEvent): void,
  destroy(): void,
}
```

## Built-in (zero dependencies)

### `memory`

Ring buffer for timeline and debug JSON export. Always safe to enable.

### `console`

Structured console output. Useful in development.

### `devPanel`

Floating UI panel. Enable with:

```javascript
localStorage.setItem('semantic-event-observability:debug', 'true')
```

Or `exporterConfig.devPanel.enabled = true`.

## Grafana stack

### `faro`

Requires `@grafana/faro-web-sdk` **or** `window.faro`.

Sends Faro custom events consumed by Loki. Pair with Faro Collector → Grafana.

```javascript
exporterConfig: {
  faro: { client: faroInstance },
}
```

### `otel`

Requires `@opentelemetry/api` **or** injected tracer, meter, and trace API.

Creates **one trace tree per conversation turn**:

- `turn.start` → root span `turn:<startEvent>`
- Configured `phases` → `phase:<id>` spans (Hands for Bots: `phase:backend`)
- Each `bus.trigger` → child span `event:<name>` under the turn root
- Root attributes: `turn.duration_ms`, `phase.<id>_ms`, `phase.render_ms`
- **Metrics:** `sevo_*` histograms/counters via OTel Metrics API when `getMeter` is provided
- **Turn root spans:** default `turn:<startEvent>`; opt in to OTel GenAI `invoke_agent` via `turnRootSpan: 'invoke_agent'` or `{ mode: 'invoke_agent', providerName, agentName }`

```javascript
exporterConfig: {
  otel: {
    getTracer: stack.getTracer,
    getMeter: stack.getMeter,
    traceApi: { context, trace, SpanStatusCode },
  },
}
```

`phases` are set on `createObservability({ phases })`. The Hands for Bots adapter passes `HFB_PHASE_MODEL`.

## LLM observability

### `langfuse`

Requires `@langfuse/tracing` **or** injected `startObservation`.

Maps:

- `turn.start` → Langfuse span
- `turn.end` → span end + duration
- `bus.trigger` → Langfuse event

```javascript
exporterConfig: {
  langfuse: {
    project: 'my-app',
    startObservation, // optional injection
  },
}
```

Ensure Langfuse OTel processor or cloud ingestion is configured in the host app.

### `langsmith`

Requires `langsmith` **or** injected `RunTree`.

Maps:

- `turn.start` → chain run
- `bus.trigger` → tool run (child of turn)
- `turn.end` → run end

```javascript
exporterConfig: {
  langsmith: {
    projectName: 'my-app',
    RunTree, // optional injection
    tags: ['handsforbots'],
  },
}
```

Set `LANGSMITH_API_KEY` in the host environment when using the LangSmith SDK directly.

## Custom exporter

See [custom-exporter.md](./custom-exporter.md) for a full cookbook with `registerExporter()`, phase hooks, and production checklist.

Quick sketch:

```javascript
await observability.registerExporter({
  id: 'myBackend',
  available: true,
  onEvent(event) { /* send to API */ },
  onMetric(metric) { /* sevo_* metrics */ },
})
```

## Recommended production set

| Environment | Exporters |
|-------------|-----------|
| Local dev | `memory`, `console`, `devPanel` |
| Staging | `memory`, `faro`, `otel` |
| Production | `faro`, `otel` (+ `langfuse`/`langsmith` if LLM-heavy) |
| LLM debugging | add `langfuse`, `langsmith` |

Always keep `sampleRate` and `maxEventsPerMinute` conservative in production.
