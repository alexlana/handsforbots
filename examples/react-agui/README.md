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

## What it shows

- `useAction` registers GUI actions; the same actions serve the assistant (tool calls) and the menu (direct commands).
- `useContextSignal('orders.view', …)` sends what is on screen with every turn.
- Direct and assistant routes share the same visual grammar (received → acting → done) with a minimum state duration, so instant commands don't flicker.
- `h4b.provide('confirm', …)` gates destructive actions for every origin.
