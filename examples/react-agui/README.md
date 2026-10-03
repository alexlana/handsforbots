# React + AG-UI (v2)

A small orders dashboard where the assistant works **on the GUI** with you: it filters the list, opens orders, highlights where things are and cancels orders (with confirmation). The conversation panel is built with the app's own components; Hands for Bots only provides the runtime.

## Run

From the repository root:

```bash
pnpm install
pnpm --filter @handsforbots/example-react-agui dev
```

No API key or Docker needed: a deterministic **mock AG-UI agent** ([agent/mockAgent.ts](./agent/mockAgent.ts)) runs inside the Vite dev server at `/api/agent`. It speaks the real protocol (SSE), so you can point `agui({ url })` in [src/main.tsx](./src/main.tsx) to any AG-UI server (CopilotKit runtime, LangGraph, Mastra, PydanticAI…).

## Try

| You type | Route | What happens |
|----------|-------|--------------|
| `mostre os pedidos atrasados` | assistant (AG-UI) | Agent calls `filter_orders` on the page, then explains |
| `/todos`, `pedidos abertos`, `abrir pedido 1042` | ⚡ direct | Menu runs the action instantly, no LLM, still in history |
| chip **⚡ Pedidos atrasados** | ⚡ direct | Same, from a button |
| `onde eu exporto?` | assistant | Agent calls `highlight` and the button pulses |
| `cancele o pedido 1043` | assistant | Destructive action → confirmation dialog |

## Voice and keyboard

- **🎤 button**: hold to talk (push-to-talk) or toggle (hands-free). Same with **Alt+M** on the keyboard.
- **Output follows input**: spoken questions get spoken answers; typed ones stay silent. Change it in the "Saída" selector.
- **Barge-in**: start talking (or press **Esc**) while the bot speaks to interrupt it. Esc also cancels a running turn.
- Uses the browser's Web Speech API. To use a cloud provider instead (or as a fallback), change only `main.tsx`:

```ts
voice({
  stt: [
    websocketSTT({ url: async () => `wss://stt.example.com?token=${await getToken()}`, parse }), // streaming cloud
    httpSTT({ url: '/api/stt' }), // your backend proxies Whisper/Google/Azure (no keys in the browser)
    webSpeechSTT(), // browser fallback
  ],
  tts: [httpTTS({ url: '/api/tts' }), webSpeechTTS()],
  language: 'pt-BR',
})
```

## Browser agents (WebMCP)

The same actions are published to agents running in the browser through [WebMCP](https://github.com/webmachinelearning/webmcp) (`document.modelContext`, Chrome origin trial 149–156 or `chrome://flags/#enable-webmcp-testing`). The badge in the header shows how many tools are exposed. Only actions with `exposeTo: ['agent']` are published; destructive ones still ask the user, and every agent call shows up in the conversation as "🌐 agente do navegador".

## What it shows

- `useAction` registers GUI actions; the same actions serve the assistant (tool calls) and the menu (direct commands).
- `useContextSignal('orders.view', …)` sends what is on screen with every turn.
- Direct and assistant routes share the same visual grammar (received → acting → done) with a minimum state duration, so instant commands don't flicker.
- `h4b.provide('confirm', …)` gates destructive actions for every origin.
