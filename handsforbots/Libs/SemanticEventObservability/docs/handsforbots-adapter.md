# Hands for Bots adapter

File: [`adapters/handsforbots.js`](../adapters/handsforbots.js)

Plugin wrapper: [`handsforbots/Plugins/Output/Observability/Observability.js`](../../../Plugins/Output/Observability/Observability.js)

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
this.bot.observability?.record('plugin.custom_action', { action: 'open_gallery' })
this.bot.observability?.recordMetric('gallery.open', 1, { plugin: 'ImageGallery' })
```

## Dev panel

```javascript
localStorage.setItem('semantic-event-observability:debug', 'true')
location.reload()
```

Or pass `exporterConfig: { devPanel: { enabled: true } }` in the plugin options.

## Direct adapter (advanced)

For non-plugin setups or tests:

```javascript
import { attachHandsForBotsObservability } from './Libs/SemanticEventObservability/adapters/handsforbots.js'

attachHandsForBotsObservability(bot, { exporters: ['memory'] })
```
