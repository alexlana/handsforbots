# Grafana dashboard validation

Checklist and automated smoke test for bundled dashboards targeting **`sevo_*`** metrics.

## Dashboard files

| File | Use |
|------|-----|
| `grafana/semantic-event-observability.json` | Import template (select Loki/Tempo/Prometheus) |
| `grafana/semantic-event-observability.lgtm.json` | Pre-provisioned in `examples/` LGTM stack |

## Automated smoke test

```bash
cd handsforbots/Libs/SemanticEventObservability
npm test -- test/grafana-dashboard.test.js
```

The test asserts each dashboard JSON includes PromQL for core P0/P1 metrics:

- `sevo_turn_duration_ms`
- `sevo_phase_duration_ms`
- `sevo_phase_wait_ms`
- `sevo_events_dropped_total`
- `sevo_state_gauge`
- `sevo_turns_total`
- `sevo_bus_events_total`

## Manual LGTM validation

1. Start the example stack with observability enabled (`examples/OBSERVABILITY.md`).
2. Open Grafana → **Semantic Event Observability** dashboard.
3. Send a few chat turns in the Vite example.
4. Confirm within ~30s (metric export interval):

| Panel | Expected |
|-------|----------|
| Turn duration p95 | Non-empty after turns complete |
| Phase duration p95 | `backend` (or configured phase) after backend round-trip |
| Phase wait p95 | Non-zero after turn → backend delay |
| Turn outcomes rate | `completed` series |
| Backend queue depth | Reflects orchestrator queue |
| Bus event rate | `core.input`, `core.output_ready`, etc. |
| Dropped telemetry | Zero or low with full sample rate |
| Tempo / Recent turns | Turn traces with phase children |

5. Drilldown → Metrics: search `sevo_` — all P0 instruments should appear.

## Tempo trace checks

- Service: `semantic-event-observability`
- Root span: `turn:core.input` (or `invoke_agent` when `turnRootSpan` enabled)
- Child spans: `phase:backend`, `event:*`

## When panels stay empty

| Symptom | Likely cause |
|---------|----------------|
| All Prometheus panels empty | OTel metrics export not wired; check `getMeter` in exporter config |
| Traces only, no metrics | MeterProvider not registered globally |
| Histogram panels empty but `sevo_*_count` exists in Explore | PromQL metric name mismatch — OTel must not set `unit: 'ms'` on instruments already named `*_ms` (otherwise Prometheus gets `*_milliseconds_bucket` while dashboards query `*_bucket`) |
| Phase / status / queue panels empty | Label mismatch — metric labels are `phase`, `status`, `key` (not `sevo_phase`, etc.) |
| Bus events empty | Bus not instrumented or no traffic |
| Phase wait empty | No `phases` configured or phases start immediately on turn start |
| p95 shows NaN briefly | Need ongoing chat traffic in the selected time range; histogram `rate()` needs counter movement across scrapes |

## Related

- [metrics-roadmap.md](./metrics-roadmap.md)
- [tail-sampling.md](./tail-sampling.md)
- [exporters.md](./exporters.md)
