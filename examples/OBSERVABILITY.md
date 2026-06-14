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

1. `observability-stack.js` bootstraps **OpenTelemetry → OTLP** on port 4318 (traces)
2. **Grafana Faro** sends semantic events to **Alloy** on port 12347 → Loki
3. The **Observability** output plugin sends spans for turns and `core.*` events
4. Fetch calls (e.g. Rasa) are also traced via `FetchInstrumentation`

### Why Drilldown shows data but this dashboard is empty

Grafana **Drilldown** lists *all* telemetry in the local LGTM stack (including tools like Cursor IDE as `cursor-agent`).  
This dashboard filters **`semantic-event-observability` only** — data appears after you use the chat at http://localhost (reload the page after stack changes).

Prometheus panels for custom `seo_*` metrics were removed until the lib emits them.

## Local dev without Docker for the bot

```bash
# Terminal 1 — LGTM
docker compose -f docker-compose.observability.yml up

# Terminal 2 — Vite on the host
cd vite
npm run dev:observability
```

## Grafana dashboard

Provisioned automatically when LGTM starts (`docker-compose.observability.yml` mounts the lib dashboard):

- **Source:** `handsforbots/Libs/SemanticEventObservability/grafana/semantic-event-observability.lgtm.json`
- **Folder:** Hands for Bots
- **Title:** Semantic Event Observability
- **Home dashboard:** opens by default at http://localhost:3000

Tempo panels use TraceQL search tables. Loki panels populate via **Faro → Alloy → Loki**. Restart LGTM after dashboard changes:

```bash
docker compose -f docker-compose.observability.yml up -d --force-recreate
```

TraceQL:

```traceql
{ resource.service.name="semantic-event-observability" && name=~"turn:.*" }
```

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
