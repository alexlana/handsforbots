# Metrics roadmap (library)

Development checklist for **`sevo_*` metrics only** — emitted by Semantic Event Observability.

> **Not in this document:** Hands for Bots product metrics (`hfb_*`) → [handsforbots-roadmap.md](./handsforbots-roadmap.md).  
> **Abstractions plan:** [roadmap.md](./roadmap.md).

---

## Naming rules

| Rule | Example |
|------|---------|
| Prefix | `sevo_` |
| Unit suffix | `_ms`, `_total`, `_bytes` |
| Histograms | Turn duration, phase duration |
| Counters | Turns, drops, events emitted |
| Gauges | State keys from `stateProvider` |

**Standard labels (low cardinality):**

- `environment`
- `phase` — phase id from PhaseModel
- `status` — `completed` \| `abandoned` \| `error`
- `reason` — policy drop reason
- `event_type` — `bus.trigger` \| `turn.end` \| …

Never label with `sessionId`, `turnId`, or raw payload text.

---

## Industry mapping (front-end)

| Industry metric | Library metric | Notes |
|-----------------|----------------|-------|
| End-to-end turn latency | `sevo_turn_duration_ms` | Client-perceived wait |
| Per-stage latency | `sevo_phase_duration_ms{phase}` | PhaseModel-driven |
| Turn success rate | `sevo_turns_total{status}` | completed vs abandoned |
| Telemetry loss | `sevo_events_dropped_total{reason}` | Policy transparency |
| Queue / backlog pressure | `sevo_state_gauge{key="queueDepth"}` | From stateProvider |
| Throughput | `rate(sevo_turns_total{status="completed"})` | Derived in Grafana |

Backend `gen_ai.*` metrics are **not** emitted by this lib. Hosts join traces via [TraceContextBridge](./roadmap.md#6-tracecontextbridge-new--backend-correlation).

---

## Checklist

Status: `[ ]` not started · `[~]` partial · `[x]` done

### P0 — SLO readiness

| # | Metric | Type | Trigger | Status |
|---|--------|------|---------|--------|
| M0.1 | `sevo_turn_duration_ms` | histogram | `turn.end` → `durationMs` | [x] |
| M0.2 | `sevo_phase_duration_ms` | histogram | PhaseTracker phase end | [x] |
| M0.3 | `sevo_turns_total` | counter | `status=completed` on turn end | [x] |
| M0.4 | `sevo_turns_total` | counter | `status=abandoned` on new turn without end | [x] |
| M0.5 | `sevo_events_dropped_total` | counter | `Policy.recordDrop(reason)` | [x] |
| M0.6 | `sevo_state_gauge` | gauge | `stateProvider()` keys | [x] |
| M0.7 | OTel Metrics API wiring | — | `MetricsRegistry` → exporter | [x] |
| M0.8 | Grafana dashboard smoke test | — | `grafana/semantic-event-observability.json` | [~] |

**Implementation:** single `MetricsRegistry` module; OTel exporter reads from registry (see [roadmap.md](./roadmap.md#4-metricsregistry-new--single-source-of-truth)).

**SLO examples:**

```promql
histogram_quantile(0.95, sum(rate(sevo_turn_duration_ms_bucket[5m])) by (le))
sum(rate(sevo_turns_total{status="abandoned"}[5m])) / sum(rate(sevo_turns_total[5m]))
sum(increase(sevo_events_dropped_total[5m])) by (reason)
sum(increase(sevo_session_turns_total[5m])) by (status, reason)
```

---

### P1 — Reliability & visibility

| # | Metric | Type | Trigger | Status |
|---|--------|------|---------|--------|
| M1.1 | `sevo_phase_wait_ms` | histogram | turn start → phase start | [ ] |
| M1.2 | `sevo_turns_total` | counter | `status=error` when error heuristic fires | [x] |
| M1.3 | `sevo_events_emitted_total` | counter | `type` + bucketed `name` | [x] |
| M1.4 | `sevo_exporter_errors_total` | counter | exporter catch blocks | [x] |
| M1.5 | `sevo_active_turns` | gauge | open turns (diagnostic) | [x] |
| M1.6 | Span `error.type` attribute | — | pluggable `isError(event)` | [x] |

---

### P2 — Session & host-agnostic depth

| # | Metric | Type | Trigger | Status |
|---|--------|------|---------|--------|
| M2.1 | `sevo_session_turns_total` | counter | session boundary (configurable) | [x] |
| M2.2 | `sevo_custom_metrics_total` | counter | `recordMetric()` with name allowlist | [ ] |
| M2.3 | `sevo_bus_events_total` | counter | `bus.trigger` by bucketed name | [ ] |
| M2.4 | `sevo_listener_duration_ms` | histogram | `wrapListeners: true` | [ ] |
| M2.5 | `sevo_web_vital` | histogram | `webVitals` exporter | [x] |

---

## `recordMetric()` convention

Host apps may call `observability.recordMetric(name, value, labels)` for domain metrics.

| Rule | Detail |
|------|--------|
| Lib does not rename | Host owns prefix (`hfb_`, `myapp_`) |
| Policy | Subject to `metric.gauge` policy gate |
| Export | All exporters receive `onMetric` |
| Recommendation | Document host prefix in adapter; avoid `sevo_` in `recordMetric` |

---

## Grafana

Dashboard templates: `grafana/semantic-event-observability.json`, `grafana/semantic-event-observability.lgtm.json`.

Panels expect P0 metrics. Host-specific panels belong in host repos, not lib dashboards.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-15 | Initial combined doc (lib + HfB) |
| 2026-06-15 | Phase A metrics implemented (`MetricsRegistry`, `TurnMetricsCollector`, OTel Metrics API) |
