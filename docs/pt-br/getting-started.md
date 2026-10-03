# Primeiros passos

O Hands for Bots (H4B) é um runtime headless: você cria uma instância, adiciona plugins e decide qual interface usar (o widget `<h4b-chat>`, seus próprios componentes ou o CopilotKit). Tudo é plugin, inclusive a conexão com o backend.

> Os pacotes ainda não estão no npm. Dentro deste repositório eles são resolvidos pelo workspace do pnpm (`pnpm install`). Veja [Desenvolvimento](./development.md).

## 1. O mínimo: widget + qualquer backend

```ts
import { createH4B } from '@handsforbots/core'
import { rasa } from '@handsforbots/transport-rasa'
import { widget } from '@handsforbots/widget'

const h4b = createH4B({
  plugins: [
    rasa({ url: 'http://localhost:5005/webhooks/rest/webhook' }),
    widget({ botName: 'Assistente', language: 'pt-br', startOpen: true }),
  ],
})
await h4b.start()
```

Troque o transporte sem mexer no resto:

| Backend | Plugin |
|---------|--------|
| Qualquer servidor AG-UI (runtime do CopilotKit, LangGraph, Mastra, PydanticAI…) | `agui({ url })` de `@handsforbots/transport-agui` |
| Rasa (canal REST) | `rasa({ url })` de `@handsforbots/transport-rasa` |
| Sua própria API HTTP (sessões, SSE, tool calls) | `http({ url, session, body, parse })` de `@handsforbots/transport-http` |
| Backend UniversalLLM da v1 (proxy PHP/Laravel) | `universalLLM({ url, provider, model })` |
| APIs compatíveis com OpenAI (OpenAI, Ollama, vLLM, LiteLLM…) | `openAICompatible({ baseUrl, model })`, só para desenvolvimento se a chave estiver no navegador |
| O CopilotKit é dono do agente | `useCopilotKitBridge()` de `@handsforbots/copilotkit` |

## 2. Deixe o assistente agir na sua interface

As ações são o coração do H4B. Declare o que a interface sabe fazer; o assistente (tool calls), o usuário (comandos diretos) e agentes do navegador (WebMCP) passam a poder acioná-las, sob as mesmas regras.

```ts
h4b.actions.register({
  name: 'filter_orders',
  description: 'Filtra a lista de pedidos por status',
  parameters: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'late', 'closed'] } }, required: ['status'] },
  handler: ({ status }) => tabelaDePedidos.filtrar(status),
  exposeTo: ['assistant', 'user', 'agent'],
})

h4b.actions.register({
  name: 'cancel_order',
  description: 'Cancela um pedido',
  input: z.object({ id: z.string() }), // qualquer Standard Schema (Zod, Valibot, ArkType) também gera o JSON Schema
  destructive: true, // pergunta ao usuário antes, seja quem for que pediu
  handler: ({ id }) => api.cancelar(id),
})

h4b.provide('confirm', async ({ description, origin }) => window.confirm(`${description}? (pedido por ${origin})`))
```

Conte ao assistente o que está na tela com sinais de contexto; eles vão junto em todo turno:

```ts
h4b.signal({ kind: 'context', key: 'orders.view', modality: 'gui-event', source: 'app',
  parts: [{ type: 'data', name: 'view', value: { filter: 'late', selected: '1042' } }] })
```

## 3. Teclado e voz

```ts
import { voice, webSpeechSTT, webSpeechTTS, httpSTT } from '@handsforbots/voice'
import { keyboard } from '@handsforbots/keyboard'

createH4B({
  plugins: [
    voice({
      stt: [httpSTT({ url: '/api/stt' }), webSpeechSTT()], // nuvem primeiro, navegador como reserva
      tts: webSpeechTTS(),
      language: 'pt-BR',
      mode: 'push-to-talk', // ou 'hands-free'
    }),
    keyboard(), // segure Alt+M para falar, Esc interrompe, Mod+K pede a paleta
  ],
})
```

Perguntas faladas recebem respostas faladas; digitadas ficam em silêncio (configurável). Veja [Plugins → voice](./plugins.md#voice).

## 4. Comandos diretos (sem LLM)

```ts
import { menu } from '@handsforbots/menu'

menu({
  language: 'pt-br',
  commands: [
    { action: 'filter_orders', label: 'Pedidos atrasados', slash: 'atrasados', phrases: ['pedidos atrasados'], args: { status: 'late' } },
    { action: 'filter_orders', patterns: ['mostrar pedidos {status}'], args: ({ status }) => ({ status }) },
  ],
})
```

"pedidos atrasados", `/atrasados` ou um botão executam a ação na hora e ficam no histórico, para o LLM saber o que aconteceu no próximo turno.

## 5. React

```tsx
import { H4BProvider, useAction, useContextSignal, useMessages } from '@handsforbots/react'

root.render(<H4BProvider value={h4b}><App /></H4BProvider>)

function Pedidos() {
  const [status, setStatus] = useState('all')
  useAction({ name: 'filter_orders', description: '…', parameters, handler: ({ status }) => setStatus(status) })
  useContextSignal('orders.view', { status })
  // …
}
```

## Próximos passos

- [Conceitos](./concepts.md): sinais, turnos, estímulos, rotas, síncrono/assíncrono.
- [Plugins](./plugins.md): todos os pacotes e opções.
- [Escrevendo plugins](./writing-plugins.md).
- [Segurança](./security.md).
- Exemplos: [`examples/react-agui`](../../examples/react-agui/README.md) (React + AG-UI + voz + WebMCP) e [`examples/vite`](../../examples/README.md) (Rasa + widget + tours guiados).
