# Hands for Bots — examples

Runnable demos for the library. All commands below assume you are in this directory (`examples/`).

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
├── vite/                              ← front-end demo (Init.js)
├── rasa/                              ← demo assistant
├── nginx/                             ← reverse proxy config
└── observability/grafana/             ← provisioning config (dashboard JSON lives in the lib)
```

## Other demos

- **Guided tour:** `vite/src/guided.html` + `guided-init.js`
- **Rasa project:** see [rasa/README.md](./rasa/README.md)
