# Hands for Bots adapter

Hands for Bots v2 integrates through the plugin [`@handsforbots/observability`](../../observability/src/index.ts). The v1 adapter (`adapters/handsforbots.js`, which instrumented the v1 `eventEmitter`) was removed together with v1.

## Scope

The plugin instruments the **semantic flow** of the v2 kernel. It does **not** monitor whether the application or its backends are up.

| Covered | Not covered (use another stack) |
|---------|--------------------------------|
| Turn latency (`turn.started` → `turn.done` / `turn.error` / `turn.aborted`) | Uptime / synthetic HTTP probes |
| Phase per route: `transport`, `direct` (menu), `capture`, `agent` (WebMCP), `push` | Backend `/health` endpoints |
| Actions by origin (`action.invoked` / `action.failed`, origin `user` / `assistant` / `agent`) | Kubernetes liveness/readiness |
| Signals by modality (`signal.text`, `signal.transcript`, `signal.image`…), without content by default | "Site down" alerting |
| Stimuli (`stimulus.ui.effect`, `stimulus.action.call`, `stimulus.error`…), token deltas excluded | |
| Telemetry export health (`sevo_exporter_errors_total`) | |

## Usage

```ts
import { createH4B } from '@handsforbots/core'
import { observability } from '@handsforbots/observability'

const h4b = createH4B({
  plugins: [
    observability({
      environment: 'production',
      sampleRate: 0.2,
      maxEventsPerMinute: 120,
      exporters: ['memory', 'faro', 'otel', 'langfuse', 'langsmith'],
      exporterConfig: {
        langfuse: { project: 'handsforbots' },
        langsmith: { projectName: 'handsforbots' },
      },
      // includeContent: true, // only if your privacy policy allows logging message text
    }),
  ],
})
```

All `createObservability` options are accepted. The instance is available as a service: `h4b.get('observability')`.

### Trace propagation to the backend

Pass trace headers to HTTP-based transports so a turn is one trace from the browser to the LLM:

```ts
agui({ url: '/api/agent', headers: () => h4b.get('observability')?.getTraceHeaders() ?? {} })
```

## Turn and phase model

| Kernel event | Semantic event |
|--------------|----------------|
| first `turn.status` of a turn | `turn.started` |
| `turn.status` `acting` with route R | `route.R.start` |
| `turn.status` `done` / `error` / `aborted` | `route.R.end`, then `turn.done` / `turn.error` / `turn.aborted` |

Exports: `H4B_TURN_START_EVENTS`, `H4B_TURN_END_EVENTS`, `H4B_PHASES` from `@handsforbots/observability`.
