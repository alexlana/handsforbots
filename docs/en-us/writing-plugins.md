# Writing plugins

A plugin is a plain object created by `definePlugin`. It can provide services, register actions, listen to events, intercept the flow and clean up after itself automatically.

```ts
import { definePlugin } from '@handsforbots/core'

export type WeatherOptions = { apiUrl: string }

export const weather = definePlugin<WeatherOptions>({
  name: 'weather',
  inject: ['transport'],           // mount after these services exist
  provides: [],                    // services this plugin provides (checked after apply)
  // config: z.object({ apiUrl: z.string().url() }),  // optional Standard Schema validation
  apply(ctx, options) {
    ctx.registerAction({
      name: 'show_weather',
      description: 'Shows the weather for a city on the dashboard',
      parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      readOnly: true,
      handler: async ({ city }, call) => {
        const data = await fetch(`${options.apiUrl}?q=${encodeURIComponent(city)}`, { signal: call.signal }).then((r) => r.json())
        call.render?.('weather-card', data)          // rich content in the reply
        return { temperature: data.temp }
      },
    })

    ctx.on('turn.status', (status) => { /* notifications: never block */ })

    ctx.intercept('request.before', (request) => ({ ...request, state: { ...request.state as object, units: 'metric' } }))

    ctx.effect(() => {
      const id = setInterval(refresh, 60_000)
      return () => clearInterval(id)                 // runs on dispose
    })
  },
})

// createH4B({ plugins: [weather({ apiUrl: '/api/weather' })] })
```

## The context (`ctx`)

| Method | |
|--------|---|
| `provide(key, service)` / `get(key)` / `require(key)` | Services by stable key |
| `registerAction(definition)` | Actions (removed on dispose) |
| `on(event, listener)` / `emit(event, payload)` | Notifications |
| `intercept(hook, fn, priority?)` | `signal.before`, `request.before`, `action.before`, `stimulus.before` |
| `addMatcher(matcher)` | Direct-command recognition (see `menu`) |
| `capture(handler, { accepts })` | Take some trigger signals for yourself (see `guided`) |
| `signal(input)` | Send input (source defaults to the plugin name) |
| `effect(setup)` / `onDispose(fn)` | Resources with cleanup |
| `app` | The H4B instance (`ask`, `runAction`, `push`, `messages`…) |

## Typed services and events

Extend the kernel's interfaces with declaration merging so other code gets types:

```ts
export type WeatherService = { current(city: string): Promise<number> }

declare module '@handsforbots/core' {
  interface Services { weather: WeatherService }
  interface Events { 'weather.updated': { city: string; temperature: number } }
}
```

Optional integrations should not import other plugins at runtime: use `ctx.get('voice')` and react to `service.provided` / `service.removed` (see how the widget discovers `voice`, `files` and `camera`). A type-only import (`import type {} from '@handsforbots/voice'`) brings the types.

## Writing a transport

A transport turns a `TurnRequest` (thread, history, context signals, actions, state) into stimuli:

```ts
const myTransport: Transport = {
  name: 'my-backend',
  capabilities: { streaming: true, tools: true },
  async *run(request, signal) {
    const res = await fetch('/api/chat', { method: 'POST', body: JSON.stringify(request), signal })
    const { text, toolCalls } = await res.json()
    yield { type: 'message.delta', messageId: 'm1', delta: text }
    for (const call of toolCalls ?? []) yield { type: 'action.call', callId: call.id, name: call.name, args: call.args }
  },
  // connect?(deliver) { … } for server push outside turns
}
```

Client actions requested with `action.call` are executed by the kernel, which then calls `run` again with the results in history (up to `maxActionRoundtrips`). Emit `action.result` for tools your backend already executed. Most HTTP APIs fit [`http()`](./plugins.md#transport-http) without writing a transport.

## Testing

Plugins are plain code: create an instance, provide a scripted transport and await turns.

```ts
const h4b = await createH4B({ plugins: [weather({ apiUrl: '/x' })] }).start()
h4b.provide('transport', { name: 't', async *run() { yield { type: 'action.call', callId: '1', name: 'show_weather', args: { city: 'Lisboa' } } } })
const { messages } = await h4b.ask('weather in Lisbon?')
```

Publishing: name official packages `@handsforbots/<name>` and community ones `h4b-plugin-<name>`, and add the `h4b-plugin` topic on GitHub. Plugins target kernel API version 2 (`apiVersion`).
