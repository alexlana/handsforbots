# Architecture

Host-agnostic design. For **Hands for Bots** integration, see [handsforbots-adapter.md](./handsforbots-adapter.md). For planned abstractions, see [roadmap.md](./roadmap.md).

```mermaid
flowchart TB
  App["Host application"]
  Adapter["Optional adapter preset"]
  Bus["Event bus (on/trigger)"]
  Core["createObservability"]
  Policy["Policy<br/>sample · redact · rate limit"]
  Corr["CorrelationContext / TurnModel<br/>session · turn · trace"]
  Phase["PhaseTracker / definePhaseModel"]
  Buffer["EventBuffer"]
  Metrics["MetricsRegistry"]
  Exporters["Exporters (optional)"]
  Grafana["Grafana LGTM"]
  LLM["Langfuse / LangSmith"]

  App --> Adapter
  Adapter --> Bus
  Bus --> Core
  Core --> Policy
  Core --> Corr
  Core --> Phase
  Core --> Buffer
  Core --> Metrics
  Core --> Exporters
  Exporters --> Grafana
  Exporters --> LLM
```

## Semantic event schema

Each recorded event includes:

| Field | Description |
|-------|-------------|
| `id` | Unique event id |
| `timestamp` | ISO-8601 |
| `type` | `bus.trigger`, `bus.listener`, `turn.start`, `turn.end`, `turn.abandoned`, `phase.start`, `phase.end`, `custom` |
| `name` | Event name (`core.input`, …) |
| `sessionId` | Browser session |
| `turnId` | Conversation turn (correlates input → output) |
| `traceId` | Trace id for OTel/Faro/Langfuse |
| `payloadSummary` | Redacted preview |
| `state` | Optional host state (queue depth, …) |
| `durationMs` | Turn duration on `turn.end` |

## Turn correlation

Configure which bus events open/close a turn via `turnStartEvents` / `turnEndEvents` (formal **TurnModel** in [roadmap.md](./roadmap.md)):

```javascript
turnStartEvents: ['user.message'],
turnEndEvents: ['bot.response'],
phases: definePhaseModel([
  { id: 'backend', startEvent: 'api.call', endEvent: 'api.done' },
]),
```

Hands for Bots preset: `core.input` / `core.output_ready` — see [handsforbots-adapter.md](./handsforbots-adapter.md).

Turn boundaries drive spans in OTel, runs in LangSmith, and turn panels in Grafana.

Each turn produces a **single Tempo trace** (root `turn:*`, children `phase:*` + `event:*`). Phase children are configured via **PhaseModel** (planned; today backend phase is hardcoded in the OTel exporter).

## Fail-safe design

- Exporter `init()` errors are caught per exporter.
- Optional modules use dynamic `import()` inside try/catch.
- Missing peer dependencies → exporter marked unavailable.
- Telemetry never throws into application event handlers.

## Extraction to standalone npm package

```
SemanticEventObservability/
├── packageIdentity.js   ← rename here
├── package.json
├── index.js
├── core/
├── adapters/
├── exporters/
├── utils/
├── grafana/
└── docs/
```

The Hands for Bots repo ships a thin adapter; see [handsforbots-roadmap.md](./handsforbots-roadmap.md) for consumer-specific work.
