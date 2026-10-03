# Hands for Bots — examples

Runnable demos for the library. All commands below assume you are in this directory (`examples/`).

## v2 examples

| Example | What | Run |
|---------|------|-----|
| [react-agui](./react-agui/README.md) | React dashboard where the assistant acts on the GUI via AG-UI, plus direct menu commands | `pnpm --filter @handsforbots/example-react-agui dev` (from the repo root) |

The sections below cover the **Rasa + Docker** example. It runs on v2 too (`vite/src/Init.js`, `vite/src/guided-init.js`): Rasa transport, `<h4b-chat>` widget, voice, keyboard, local storage, tab sync, guided tours and observability.

> **Upgrading an existing checkout:** rebuild the Vite image (`docker compose up --build`) because `vite.config.js` changed, and update the Rasa model once (`docker exec t4b-bot rasa train` then `docker compose restart rasa`) because `utter_please_explain` now asks the page for its guided tour through `custom.h4b` instead of v1 action tags. Only a response changed, so Rasa just repackages the model.

## Prerequisites

- Docker and Docker Compose
- For observability export: `npm install` inside `vite/` (includes optional OpenTelemetry packages)

## Basic example (chatbot only)

Starts Vite, nginx, Rasa, action server, and Duckling.

```bash
docker compose up
```

| URL | Service |
|-----|---------|
| http://localhost | Chat UI (via nginx) |
| http://localhost:5005 | Rasa API |
| http://localhost:5055 | Rasa actions |
| http://localhost:8000 | Duckling |

First build can take several minutes.

### Retrain the Rasa model

The committed model under `rasa/models/` must match the Rasa version in `dockerfiles/rasa.Dockerfile` (currently **3.6.21**). If you see empty bot replies and logs show `UnsupportedModelVersionError`, retrain:

```bash
# stack running (duckling must be up)
docker compose up -d

docker exec t4b-bot rasa train
docker compose restart rasa
```

Training takes roughly 15–30 minutes (DIET + TED epochs). The newest `.tar.gz` in `rasa/models/` is loaded on restart. Remove old models if you want a clean directory.

Stop:

```bash
docker compose down
```

## Vite app without Docker

```bash
cd vite
npm install
npm run dev
```

Open the URL printed by Vite. Point `engine_endpoint` in `src/Init.js` at a reachable Rasa instance.

## Optional observability stack

Grafana + Tempo + Loki via [`grafana/otel-lgtm`](https://grafana.com/docs/opentelemetry/docker-lgtm/).  
Full details: **[OBSERVABILITY.md](./OBSERVABILITY.md)**

Quick version:

```bash
cd vite && npm install && cd ..

cp .env.observability.example .env.observability   # file lives in examples/, not vite/

docker compose -f docker-compose.observability.yml up -d   # LGTM first
docker compose up                                          # chatbot
```

| URL | Service |
|-----|---------|
| http://localhost:3000 | Grafana (`admin` / `admin`) |
| http://localhost:4318 | OTLP HTTP |

Without `.env.observability`, the chatbot runs normally but does not export traces to Grafana.

## Layout

```
examples/
├── README.md                          ← this file
├── OBSERVABILITY.md                   ← Grafana / OTel guide
├── docker-compose.yml                 ← basic stack
├── docker-compose.observability.yml   ← LGTM only (optional)
├── .env.observability.example         ← copy to .env.observability to enable export
├── react-agui/                        ← v2 React + AG-UI demo (pnpm)
├── vite/                              ← Rasa demo on v2 (Init.js, guided-init.js)
├── rasa/                              ← demo assistant
├── nginx/                             ← reverse proxy config
└── observability/grafana/             ← provisioning config (dashboard JSON lives in the lib)
```

## Other demos

- **Guided tour:** `vite/src/guided.html` + `guided-init.js`
- **Rasa project:** see [rasa/README.md](./rasa/README.md)
