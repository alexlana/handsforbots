# Getting started

## 1. Enable in Hands for Bots

Register the Observability output plugin:

```javascript
bot_settings.plugins.push({
  type: 'output',
  plugin: 'Observability',
})
```

Omit the plugin (or set `enabled: false`) to disable observability entirely.

## 2. Dev panel (local triage)

```javascript
localStorage.setItem('semantic-event-observability:debug', 'true')
location.reload()
```

The panel shows recent semantic events and exports a sanitized JSON bundle. Full analysis belongs in Grafana.

## 3. Production stack (Grafana LGTM)

1. Install and init **Grafana Faro** in your app shell (optional but recommended).
2. Install **OpenTelemetry browser SDK** if you want Tempo traces (optional).
3. Configure the plugin:

```javascript
{
  type: 'output',
  plugin: 'Observability',
  environment: 'production',
  sampleRate: 0.1,
  maxEventsPerMinute: 60,
  exporters: ['memory', 'faro', 'otel'],
}
```

4. Run a collector with auth + rate limiting in front of Loki/Tempo.
5. Import the dashboard from `grafana/semantic-event-observability.json`.

## 4. Langfuse / LangSmith (optional)

```javascript
{
  type: 'output',
  plugin: 'Observability',
  exporters: ['memory', 'langfuse', 'langsmith'],
  exporterConfig: {
    langfuse: { project: 'handsforbots' },
    langsmith: { projectName: 'handsforbots' },
  },
}
```

Install optional packages in the host app:

```bash
npm i @langfuse/tracing langsmith
```

If packages are absent, those exporters stay inactive — no runtime error.

## 5. Debug API on `window`

After the plugin loads:

```javascript
window.__SEMANTIC_EVENT_OBSERVABILITY__
// .getTimeline()
// .getExporterStatus()
// .getPolicyStats()
```

See [renaming.md](./renaming.md) for how the global key changes with the package slug.
