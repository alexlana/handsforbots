# Tail sampling guidance

Semantic Event Observability applies **head sampling** in the browser via `Policy` (`sampleRate`, `maxEventsPerMinute`). For production conversational apps you typically combine that with **tail sampling** in the collector so error and slow turns are kept while routine traffic is dropped.

## Two layers

| Layer | Where | What it controls |
|-------|--------|------------------|
| **Head** | Lib `Policy` | Whether a semantic event is recorded at all |
| **Tail** | OTel Collector / Tempo | Which completed traces are exported to long-term storage |

Head sampling reduces browser and ingress cost. Tail sampling keeps debugging signal for turns that matter after you know latency or outcome.

## Lib defaults (always keep)

These event types bypass `sampleRate` random drop (still subject to `maxEventsPerMinute` unless disabled):

- `turn.*` — turn start, end, abandoned
- `phase.*` — phase start/end (backend, render, manual)
- `session.*` — session rollups
- `metric.*` — host and lib metrics

Bus events (`bus.trigger`) are sampled. That is intentional: high-volume UI noise should not fill Tempo.

## Recommended Policy settings

| Environment | `sampleRate` | `maxEventsPerMinute` | Notes |
|-------------|--------------|----------------------|-------|
| Local dev | `1` | `120+` | Full visibility |
| Staging | `0.25`–`1` | `60` | Validate tail rules |
| Production | `0.05`–`0.2` | `30`–`60` | Pair with collector tail sampling |

Turn and phase spans still reach exporters when turns occur; only non-critical bus events are throttled.

## OpenTelemetry Collector tail sampling

Route browser traces through an OTel Collector with a `tail_sampling` processor. Example policy sketch:

```yaml
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    expected_new_traces_per_sec: 100
    policies:
      - name: errors
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: slow-turns
        type: latency
        latency:
          threshold_ms: 5000
      - name: abandoned-turns
        type: string_attribute
        string_attribute:
          key: sevo.event_name
          values: [turn.abandoned]
      - name: baseline-sample
        type: probabilistic
        probabilistic:
          sampling_percentage: 10
```

Adjust keys to match your exporter attributes (`sevo.turn_id`, `gen_ai.operation.name`, etc.).

### Hands for Bots–specific hints

| Signal | Attribute / span | Tail keep rule |
|--------|------------------|----------------|
| Slow user wait | `turn.duration_ms` on turn root | latency > SLO (e.g. 3s) |
| Backend stall | `phase:backend` duration | latency > backend SLO |
| Abandoned turn | `turn.abandoned` event / status | always |
| Error heuristic | `turn.error_event`, `error.type` | status ERROR |

## Grafana Tempo / Mimir

- **Tempo:** tail sampling happens at ingest (collector) or via Grafana Cloud sampling policies.
- **Metrics (`sevo_*`):** not trace-sampled — use Prometheus/Mimir retention and aggregation. Histograms remain statistically useful at low head sample rates for bus events; turn metrics are emitted per turn regardless of bus sample rate.

## Error-biased head sampling (optional host pattern)

The lib does not implement error-biased head sampling internally. Hosts can raise fidelity on errors by calling `observability.record()` for error paths or setting `sampleRate: 1` in staging.

For production, prefer **tail** keep rules for errors so happy-path traffic stays cheap.

## Checklist before go-live

- [ ] `sampleRate` < 1 in production plugin config
- [ ] Collector tail policy keeps ERROR and above-SLO turns
- [ ] Abandoned-turn rule validated in Tempo
- [ ] `sevo_events_dropped_total` dashboard panel for policy transparency
- [ ] Auth + rate limit on OTLP/Faro ingress (see [getting-started.md](./getting-started.md))

## Related

- [architecture.md](./architecture.md) — Policy and event flow
- [metrics-roadmap.md](./metrics-roadmap.md) — `sevo_events_dropped_total`
- [exporters.md](./exporters.md) — OTel and Faro export paths
