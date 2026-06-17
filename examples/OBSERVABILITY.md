# Observability stack (optional)

The main example (`docker compose up`) runs the chatbot only.  
This optional stack adds **Grafana + Tempo + Loki + Prometheus** via [`grafana/otel-lgtm`](https://grafana.com/docs/opentelemetry/docker-lgtm/).

There are **two compose files**, with different roles:

| File | What it starts |
|------|----------------|
| `docker-compose.yml` | Chatbot (Vite, nginx, Rasa, …) |
| `docker-compose.observability.yml` | LGTM backend only (Grafana on :3000, OTLP on :4318) |

They are **not** alternatives — the observability file is optional and runs **alongside** the basic example.

## Recommended workflow (two steps)

From `examples/`:

```bash
# 0. Once — OTel packages for the Vite app
cd vite && npm install && cd ..

# 1. Enable export in the Vite container (file in examples/, not vite/)
cp .env.observability.example .env.observability

# 2. Start LGTM first (background)
docker compose -f docker-compose.observability.yml up -d

# 3. Start the chatbot example
docker compose up
```

**Order:** LGTM first is recommended so OTLP is listening before you open the chat.  
If you reverse the order, the chat still works — traces appear once LGTM is up.

| Service | URL |
|---------|-----|
| Chatbot | http://localhost |
| Grafana | http://localhost:3000 (admin / admin) |
| OTLP HTTP | http://localhost:4318 |
| Faro collector | http://localhost:12347/collect |

## Example uptime (blackbox probes)

**Infra only** — not part of `sevo_*` or the Semantic Event Observability lib. When the observability compose is running, **Alloy** probes the example application every 30s and sends `probe_success` / `probe_duration_seconds` to LGTM Prometheus via OTLP.

| Probe | Target | When it is UP |
|-------|--------|----------------|
| `grafana` | LGTM `/api/health` | Observability compose running |
| `chat` | `http://t4b-webserver/` (Docker network) | Bot compose running |
| `rasa` | `http://t4b-bot:5005/` | Rasa container up |
| `rasa-actions` | `http://t4b-actions:5055/health` | Action server up |
| `duckling` | TCP `t4b-duckling:8000` | Duckling up |

Alloy joins the shared Docker network **`handsforbots-example`** (same as the bot compose). Probes use container DNS names — not `host.docker.internal`.

**Probe duration** with **DOWN** means the target responded (or timed out) but failed the check — e.g. HTTP non-2xx. The chat probe sends `Accept: text/html` because Vite returns 404 without it (blackbox default).

**Dashboard:** Grafana → folder **Hands for Bots** → **Example uptime** (`handsforbots-example-uptime`).

Config lives under `examples/observability/`:

- `alloy/config.alloy` — Faro receiver + blackbox probes
- `alloy/blackbox_modules.yml` — HTTP and TCP probe modules
- `grafana/example-uptime.lgtm.json` — provisioned dashboard

Only the observability stack running → **Grafana** is green; chat/Rasa probes stay red until `docker compose up` starts the bot. That is expected.

Both composes must share the **`handsforbots-example`** network (`docker-compose.yml` defines it; observability compose attaches Alloy to it). If you changed network settings, recreate both stacks:

```bash
docker compose down && docker compose up -d
docker compose -f docker-compose.observability.yml up -d --force-recreate alloy
```

PromQL examples:

```promql
probe_success{stack="handsforbots-example"}
histogram_quantile(0.95, sum(rate(probe_duration_seconds_bucket[5m])) by (le, service))
```

Scope boundaries: [library architecture — scope](../handsforbots/Libs/SemanticEventObservability/docs/architecture.md#scope).

## Example frontend / RUM

**Example infra + lib exporters** — browser health for the demo. Complements the conversational dashboard; does not replace Elastic-style session replay or SPA route tracing.

| Signal | Source | Metric / store |
|--------|--------|----------------|
| Core Web Vitals | lib `webVitals` exporter | `sevo_web_vital` → Prometheus |
| JS exceptions | Grafana Faro (`getWebInstrumentations`) | Loki via Alloy |
| Fetch / HTTP client | OTel `FetchInstrumentation` | Tempo traces |
| Telemetry health | lib policy + exporters | `sevo_exporter_errors_total`, `sevo_events_dropped_total` |

**Enable in the example:** with `.env.observability`, the Vite app loads `webVitals` and Faro instrumentations automatically (`Init.js` + `observability-stack.js`). Requires `web-vitals` in `examples/vite` (`npm install` after pull).

**Dashboard:** Grafana → **Hands for Bots** → **Example frontend** (`handsforbots-example-frontend`).

Panels use Google-style thresholds on LCP / INP / CLS p75. Reload http://localhost after stack changes so vitals are recorded.

```promql
histogram_quantile(0.75, sum by (le) (last_over_time(sevo_web_vital_bucket{vital="LCP"}[$__range])))
sum(sevo_web_vital_count) by (vital, rating)
```

## One-liner (same result)

```bash
cp .env.observability.example .env.observability
docker compose -f docker-compose.observability.yml up -d && docker compose up
```

You can also merge both files in a single command:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up
```

Still requires `.env.observability` for the Vite container to export traces.

## Basic example only (no Grafana)

```bash
docker compose up
```

Do **not** create `.env.observability` (or delete it). Observability stays local: console + memory + optional dev panel.

## What gets exported

With `.env.observability` present:

1. `observability-stack.js` bootstraps **OpenTelemetry → OTLP** on port 4318 (traces **and** `/v1/metrics`)
2. **Grafana Faro** sends semantic events to **Alloy** on port 12347 → Loki
3. **Alloy blackbox probes** send uptime metrics to LGTM Prometheus via OTLP (see [Example uptime](#example-uptime-blackbox-probes))
4. The **Observability** output plugin sends spans for turns and `core.*` events
5. **Web Vitals** (`webVitals` exporter) record `sevo_web_vital` histograms when the LGTM stack is enabled
6. Fetch calls (e.g. Rasa) are also traced via `FetchInstrumentation`
7. **Faro** captures uncaught JS exceptions to Loki (`getWebInstrumentations` in `observability-stack.js`)

### Dashboard empty after stack changes

1. Browser console should show `Observability stack: OpenTelemetry traces → …`. If you see **failed to initialize**, check the error — a common cause is a broken `observability-stack.js` import alignment (OTel/Faro packages must match `Promise.all` order).
2. Confirm `.env.observability` exists in `examples/` (not only the `.example` file).
3. Hard-reload http://localhost after restarting LGTM (`Cmd+Shift+R`).
4. Grafana **Drilldown** may show data while this dashboard is empty — panels filter `semantic-event-observability` only.
5. **Web Vitals panels empty:** the lib loads `web-vitals` via dynamic import, which fails in Vite/browser. The example injects the module from `observability-stack.js` → `Init.js` `exporterConfig.webVitals.vitals`. After pull, hard-reload the chat page and wait ~30s for OTel metric export.

### Why Drilldown shows data but this dashboard is empty

Grafana **Drilldown** lists *all* telemetry in the local LGTM stack (including tools like Cursor IDE as `cursor-agent`).  
This dashboard filters **`semantic-event-observability` only** — data appears after you use the chat at http://localhost (reload the page after stack changes).

Prometheus panels for `sevo_*` metrics populate when the lib exports via OTel Metrics API and the LGTM stack is running. Run `npm install` in `examples/vite` after pulling (adds `@opentelemetry/sdk-metrics`).

Roadmaps: [lib metrics](../../handsforbots/Libs/SemanticEventObservability/docs/metrics-roadmap.md) · [Hands for Bots](../../handsforbots/Libs/SemanticEventObservability/docs/handsforbots-roadmap.md).

## Local dev without Docker for the bot

```bash
# Terminal 1 — LGTM
docker compose -f docker-compose.observability.yml up

# Terminal 2 — Vite on the host
cd vite
npm run dev:observability
```

## Grafana dashboards

Provisioned automatically when LGTM starts (`docker-compose.observability.yml`):

| Dashboard | Source | Role |
|-----------|--------|------|
| **Semantic Event Observability** (home) | `handsforbots/Libs/SemanticEventObservability/grafana/semantic-event-observability.lgtm.json` | `sevo_*` turns, traces, semantic logs |
| **Example frontend** | `examples/observability/grafana/example-frontend.lgtm.json` | Web Vitals, Faro errors, fetch traces |
| **Example uptime** | `examples/observability/grafana/example-uptime.lgtm.json` | Blackbox probes for chat, Rasa, backends |

- **Folder:** Hands for Bots
- **Home dashboard:** Semantic Event Observability (http://localhost:3000)

Tempo panels use TraceQL search tables. Loki panels populate via **Faro → Alloy → Loki**. Restart LGTM after dashboard changes:

```bash
docker compose -f docker-compose.observability.yml up -d --force-recreate
```

TraceQL:

```traceql
{ resource.service.name="semantic-event-observability" && name=~"turn:.*" }
```

**Conversation turn flow** (top of dashboard):

1. **Click any cell in Recent turns** to load the trace below — expand the row in **Turn waterfall** to see spans. For the classic Gantt view, click **Waterfall in Explore** on the trace ID. You can also paste a trace ID in **Turn trace** (top bar) and press **Enter**.
2. **Turn waterfall** — span tree for the selected turn (`phase:backend`, `event:core.*`). Empty until a trace is selected.
3. **Event sequence** — same flow as Faro/Loki logs
4. Lower section — volume charts and raw logs

Importable template (manual install): `semantic-event-observability.json` in the same lib folder.

## Dev panel (browser)

```javascript
localStorage.setItem('semantic-event-observability:debug', 'true')
location.reload()
```

## Faro / Langfuse / LangSmith

This example stack uses **OpenTelemetry → otel-lgtm** for traces and **Faro → Alloy → Loki** for semantic event logs.  
Other backends are documented in [`SemanticEventObservability/docs/exporters.md`](../handsforbots/Libs/SemanticEventObservability/docs/exporters.md).

See also [README.md](./README.md) for the full examples layout.
