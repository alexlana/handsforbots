# Hands for Bots adapter

File: [`adapters/handsforbots.js`](../adapters/handsforbots.js)

Plugin wrapper: [`handsforbots/Plugins/Output/Observability/Observability.js`](../../../Plugins/Output/Observability/Observability.js)

## Scope

The adapter instruments **semantic flow** on the Hands for Bots event bus (`sevo_*` via the lib). It does **not** monitor whether the application or its backends are up.

| Covered | Not covered (use another stack) |
|---------|--------------------------------|
| Turn latency (`core.input` → `core.output_ready`) | Uptime / synthetic HTTP probes |
| Backend phase timing (`calling_backend` → `backend_responded`) | Rasa or LLM `/health` endpoints |
| Orchestrator state (`queueDepth`, `callingBackend`) | Kubernetes liveness/readiness |
| Telemetry export health (`sevo_exporter_errors_total`) | “Site down” alerting |

See [architecture.md](./architecture.md#scope) and the [Observability plugin docs](../../../docs/en-us/plugins/observability.md#scope).

## Integration model

Observability is enabled by adding the **Observability output plugin** — not via `Bot` constructor options.

```javascript
bot_settings.plugins.push({
  type: 'output',
  plugin: 'Observability',
  environment: 'production',
  sampleRate: 0.2,
  maxEventsPerMinute: 120,
  exporters: ['memory', 'devPanel', 'faro', 'otel', 'langfuse', 'langsmith'],
  exporterConfig: {
    langfuse: { project: 'handsforbots' },
    langsmith: { projectName: 'handsforbots' },
  },
})
```

Set `enabled: false` on the plugin entry to skip instrumentation.

## What it instruments

- `bot.eventEmitter` — all `core.*` and plugin events
- `bot.bc` (`BroadcastChannel`) — cross-tab messages (default on)

## Turn model

| Event | Role |
|-------|------|
| `core.input` | Turn start |
| `core.output_ready` | Turn end |

## Phase model

| Phase | Start | End |
|-------|-------|-----|
| `backend` | `core.calling_backend` | `core.backend_responded` |

Render time is computed automatically after the last phase ends until `core.output_ready`.

Preset: `HFB_PHASE_MODEL` in [`adapters/handsforbots.js`](../adapters/handsforbots.js).

## Runtime state

Each semantic event may include:

```javascript
{
  queueDepth: bot.orchestrator.queue.length,
  callingBackend: bot.orchestrator.calling_backend,
  redirectInput: bot.redirectInput,
}
```

## Access from other plugins

```javascript
bot.observability?.record('plugin.custom_action', { action: 'open_gallery' })
bot.observability?.recordMetric('gallery.open', 1, { plugin: 'ImageGallery' })
bot.observability?.startPhase('gallery.load')
bot.observability?.endPhase('gallery.load')
```

## Dev panel

```javascript
localStorage.setItem('semantic-event-observability:debug', 'true')
location.reload()
```

Or pass `exporterConfig: { devPanel: { enabled: true } }` in the plugin options.

## Roadmaps

| Document | Scope |
|----------|-------|
| [roadmap.md](./roadmap.md) | Library vision, abstractions, development phases |
| [metrics-roadmap.md](./metrics-roadmap.md) | `sevo_*` metrics checklist |
| [handsforbots-roadmap.md](./handsforbots-roadmap.md) | HfB adapter, `hfb_*` metrics, backend integration |

## Direct adapter (advanced)

For non-plugin setups or tests:

```javascript
import { attachHandsForBotsObservability } from './Libs/SemanticEventObservability/adapters/handsforbots.js'

attachHandsForBotsObservability(bot, { exporters: ['memory'] })
```
