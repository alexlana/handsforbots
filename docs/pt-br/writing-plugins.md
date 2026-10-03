# Escrevendo plugins

Um plugin é um objeto criado com `definePlugin`. Ele pode fornecer serviços, registrar ações, ouvir eventos, interceptar o fluxo e se limpar sozinho.

```ts
import { definePlugin } from '@handsforbots/core'

export type WeatherOptions = { apiUrl: string }

export const weather = definePlugin<WeatherOptions>({
  name: 'weather',
  inject: ['transport'],           // monta depois que esses serviços existirem
  provides: [],                    // serviços que este plugin fornece (conferido após o apply)
  // config: z.object({ apiUrl: z.string().url() }),  // validação opcional com Standard Schema
  apply(ctx, options) {
    ctx.registerAction({
      name: 'show_weather',
      description: 'Mostra o clima de uma cidade no painel',
      parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      readOnly: true,
      handler: async ({ city }, call) => {
        const data = await fetch(`${options.apiUrl}?q=${encodeURIComponent(city)}`, { signal: call.signal }).then((r) => r.json())
        call.render?.('weather-card', data)          // conteúdo rico na resposta
        return { temperature: data.temp }
      },
    })

    ctx.on('turn.status', (status) => { /* notificações: nunca bloqueiam */ })

    ctx.intercept('request.before', (request) => ({ ...request, state: { ...request.state as object, units: 'metric' } }))

    ctx.effect(() => {
      const id = setInterval(atualizar, 60_000)
      return () => clearInterval(id)                 // roda no descarte
    })
  },
})

// createH4B({ plugins: [weather({ apiUrl: '/api/weather' })] })
```

## O contexto (`ctx`)

| Método | |
|--------|---|
| `provide(key, serviço)` / `get(key)` / `require(key)` | Serviços por chave estável |
| `registerAction(definição)` | Ações (removidas no descarte) |
| `on(evento, listener)` / `emit(evento, payload)` | Notificações |
| `intercept(hook, fn, prioridade?)` | `signal.before`, `request.before`, `action.before`, `stimulus.before` |
| `addMatcher(matcher)` | Reconhecimento de comandos diretos (veja `menu`) |
| `capture(handler, { accepts })` | Pegar alguns sinais para si (veja `guided`) |
| `signal(entrada)` | Enviar entrada (a origem é o nome do plugin) |
| `effect(setup)` / `onDispose(fn)` | Recursos com limpeza |
| `app` | A instância do H4B (`ask`, `runAction`, `push`, `messages`…) |

## Serviços e eventos tipados

Estenda as interfaces do kernel com declaration merging para o resto do código ganhar tipos:

```ts
export type WeatherService = { current(city: string): Promise<number> }

declare module '@handsforbots/core' {
  interface Services { weather: WeatherService }
  interface Events { 'weather.updated': { city: string; temperature: number } }
}
```

Integrações opcionais não devem importar outros plugins em runtime: use `ctx.get('voice')` e reaja a `service.provided` / `service.removed` (veja como o widget descobre `voice`, `files` e `camera`). Um import só de tipos (`import type {} from '@handsforbots/voice'`) traz as tipagens.

## Escrevendo um transporte

Um transporte transforma um `TurnRequest` (conversa, histórico, sinais de contexto, ações, estado) em estímulos:

```ts
const meuTransporte: Transport = {
  name: 'meu-backend',
  capabilities: { streaming: true, tools: true },
  async *run(request, signal) {
    const res = await fetch('/api/chat', { method: 'POST', body: JSON.stringify(request), signal })
    const { text, toolCalls } = await res.json()
    yield { type: 'message.delta', messageId: 'm1', delta: text }
    for (const call of toolCalls ?? []) yield { type: 'action.call', callId: call.id, name: call.name, args: call.args }
  },
  // connect?(deliver) { … } para push do servidor fora de turnos
}
```

Ações pedidas com `action.call` são executadas pelo kernel, que chama `run` de novo com os resultados no histórico (até `maxActionRoundtrips`). Emita `action.result` para ferramentas que o seu backend já executou. A maioria das APIs HTTP cabe no [`http()`](./plugins.md#transport-http) sem escrever um transporte.

## Testes

Plugins são código comum: crie uma instância, forneça um transporte roteirizado e aguarde os turnos.

```ts
const h4b = await createH4B({ plugins: [weather({ apiUrl: '/x' })] }).start()
h4b.provide('transport', { name: 't', async *run() { yield { type: 'action.call', callId: '1', name: 'show_weather', args: { city: 'Lisboa' } } } })
const { messages } = await h4b.ask('clima em Lisboa?')
```

Publicação: pacotes oficiais são `@handsforbots/<nome>` e os da comunidade `h4b-plugin-<nome>`, com o tópico `h4b-plugin` no GitHub. Plugins visam a versão 2 da API do kernel (`apiVersion`).
