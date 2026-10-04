# Instructions for coding agents / Instruções para agentes de código

## v2 is the only active line. Do not work on v1.

- All development happens on the **`v2`** branch: the TypeScript monorepo in `packages/`.
- **v1 is discontinued** (the `handsforbots/` folder with `Bot.js`, `[•{...}•]` action tags and `bot.eventEmitter`, still found on `main` and older branches). Do not fix, extend, document or port anything to v1. If a request is about v1, say that v1 is discontinued and offer the v2 equivalent (`docs/en-us/migrating-from-v1.md`).
- There is no compatibility layer with v1 (ADR [0007](./docs/adr/0007-sem-compatibilidade-v1.md)).
- Branch new work from `v2` and open pull requests against `v2`, never against `main`, until `v2` is merged into `main`.

## A v2 é a única linha ativa. Não trabalhe na v1.

- Todo o desenvolvimento acontece no branch **`v2`**: o monorepo TypeScript em `packages/`.
- **A v1 foi descontinuada** (a pasta `handsforbots/` com `Bot.js`, tags `[•{...}•]` e `bot.eventEmitter`, que ainda existe na `main` e em branches antigos). Não corrija, estenda, documente nem porte nada para a v1. Se um pedido for sobre a v1, diga que ela foi descontinuada e ofereça o equivalente na v2 (`docs/pt-br/migrating-from-v1.md`).
- Não há camada de compatibilidade com a v1 (ADR [0007](./docs/adr/0007-sem-compatibilidade-v1.md)).
- Crie branches a partir da `v2` e abra pull requests contra a `v2`, nunca contra a `main`, até a `v2` ser incorporada à `main`.

## Working on v2

- Requirements: Node 20+, pnpm 10. `pnpm install`, then `pnpm test` and `pnpm typecheck` before every commit (baseline: all green).
- Architecture and decisions: `ROADMAP.md`, `docs/adr/`. Conventions, layout and the contracts the docs rely on: `.claude/skills/handsforbots-maintainer/SKILL.md`.
- Public behavior changes update `docs/en-us` **and** `docs/pt-br` in the same commit, plus `skills/` when integrators are affected.
- Every behavior has a test; time-dependent tests wait for conditions, never fixed delays.
- Commits: Conventional Commits in English, ending with a period (`feat(core): ...`, `docs: ...`).
