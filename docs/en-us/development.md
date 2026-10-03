# Development

Requirements: Node 20+ and pnpm 10.

```bash
pnpm install
pnpm test        # Vitest for all packages + node:test for semantic-event-observability
pnpm typecheck
pnpm build       # emits dist/ for every package (exports switch to dist/ on publish)
```

Layout:

```
packages/<name>/src     TypeScript sources (exports point here inside the workspace)
packages/<name>/test    Vitest (jsdom where the DOM is needed)
examples/react-agui     React + AG-UI + voice + WebMCP, with a mock agent (pnpm)
examples/vite           Rasa + widget + guided tours + observability (Docker or npm)
```

Run the examples:

```bash
pnpm --filter @handsforbots/example-react-agui dev
cd examples && docker compose up            # Rasa example (see examples/README.md)
```

Conventions:

- One package per capability; plugins never import each other at runtime (types only), they discover services through `ctx.get()`.
- Every behavior gets a test; timing-dependent tests wait for conditions, not fixed delays.
- Architecture decisions and status live in [ROADMAP.md](../../ROADMAP.md).
