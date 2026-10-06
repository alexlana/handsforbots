---
name: handsforbots-maintainer
description: Como trabalhar no monorepo do Hands for Bots v2 - kernel (@handsforbots/core), pacotes de plugins e transportes, convenções de código, testes (Vitest + node:test), typecheck, ADRs, ROADMAP, documentação bilíngue (docs/en-us + docs/pt-br) e as skills de integração em skills/. Use em qualquer mudança em packages/, docs/, examples/, skills/ ou ROADMAP.md, ou quando perguntarem como algo funciona por dentro do H4B.
---

# Hands for Bots v2 — manutenção

Monorepo pnpm (Node 20+, pnpm 10) com um kernel headless em TypeScript e um pacote por capacidade. A v1 foi removida e não há compatibilidade (ADR 0007). Arquitetura, decisões e estado do projeto: `ROADMAP.md` e `docs/adr/` (em português). Leia o ADR relevante antes de mudar um comportamento do kernel; para mudar uma decisão, escreva um ADR novo que substitua o antigo.

## Mapa

| Caminho | O que é |
|---|---|
| `packages/core/src/kernel.ts` | `H4B`: ciclo de vida, serviços, eventos, interceptadores, fila única de jobs (turnos, `runAction`, `push`), router (capture → matcher → transporte), aplicação de estímulos, persistência |
| `packages/core/src/actions.ts` | Registro e pipeline de ações: exposição por origem → `action.before` → validação → confirmação → handler |
| `packages/core/src/conversation.ts` | Histórico imutável (troca array e objetos a cada mudança) e estado compartilhado (JSON Patch) |
| `packages/core/src/types.ts`, `registry.ts` | Contratos públicos: `Signal`, `Message`, `Stimulus`, `Transport`, `Storage`; `Services`, `Events`, `Hooks` (extensíveis por declaration merging) |
| `packages/core/src/plugin.ts` | `definePlugin`, `PluginContext` (tudo registrado pelo `ctx` é desfeito no dispose), `API_VERSION` |
| `packages/transport-*` | AG-UI, Rasa, HTTP (+ `universalLLM`, `openAICompatible`), Vercel AI SDK |
| `packages/widget`, `react`, `copilotkit`, `assistant-ui` | Interfaces |
| `packages/voice`, `keyboard`, `inputs`, `menu`, `guided`, `expose-webmcp`, `mcp-apps` | Capacidades |
| `packages/storage-local`, `storage-backend`, `tab-sync`, `observability`, `testkit` | Infra; `testkit` tem a suíte de conformidade de transportes |
| `packages/semantic-event-observability` | Biblioteca JS independente, testada com `node:test` |
| `docs/en-us`, `docs/pt-br` | Documentação pública espelhada |
| `skills/` | Skills para quem **integra** o H4B (copiadas para `.claude/skills` do projeto consumidor) |
| `examples/react-agui`, `examples/vite` | Exemplos (React + AG-UI com agente simulado; Rasa + widget via Docker) |

## Comandos

```bash
pnpm install
pnpm test                                   # Vitest em packages/*/test + node:test da semantic-event-observability
pnpm typecheck                              # tsc --noEmit em todos os pacotes
pnpm build                                  # dist/ por pacote
npx vitest run packages/<pkg>/test/x.test.ts  # um arquivo
pnpm --filter @handsforbots/example-react-agui dev
```

Rode `pnpm test` e `pnpm typecheck` antes de todo commit. O estado de base é tudo verde.

## Convenções

- TypeScript estrito (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`): imports relativos com `.js`, `import type` para tipos. 2 espaços, sem ponto e vírgula, aspas simples. Comentários de código e JSDoc em inglês.
- Um pacote por capacidade. Plugins não importam outros plugins em runtime (só tipos); descobrem serviços com `ctx.get()` e reagem a `service.provided` / `service.removed`.
- Pacote novo: `package.json` com `exports` apontando para `./src/index.ts` no workspace e `publishConfig.exports` para `dist/`, `peerDependencies` em `@handsforbots/core: workspace:^`, `tsconfig.json` + `tsconfig.build.json` como os vizinhos, testes em `test/`. Registre na tabela de `packages/README.md` e em `docs/*/plugins.md`.
- **Todo comportamento tem teste.** Testes que dependem de tempo esperam condições (`eventually`, `waitForIdle`, `h4b.when`), nunca atrasos fixos. Use `jsdom` só quando precisar de DOM. Transportes novos passam pela `transportConformance` do `testkit`.
- Erros de listeners, storage e matchers vão para `emit('error', { error, source })`, nunca quebram o turno. `runAction` nunca lança.
- Segurança (ADR 0005, `docs/*/security.md`): só ações registradas executam; nada de `eval`/`window[...]`; chaves nunca no navegador; renderizadores tratam props como não confiáveis.
- Commits em Conventional Commits, em inglês, terminando com ponto: `feat(core): ...`, `fix(widget): ...`, `docs: ...`, `test(...)`, `chore: ...`. `feat!:` para quebra de API.

## Contratos que a documentação e as skills afirmam

Se mudar algum destes, atualize `docs/*/history.md`, `docs/*/concepts.md`, `skills/handsforbots*/` e esta lista no mesmo commit (e acrescente ou ajuste o teste):

- Turnos, `runAction` e `push` passam por **uma fila**, em ordem; `getSnapshot().queued` lista só sinais.
- `runAction` grava mensagem `assistant` com `toolCalls` (rota `direct` ou `agent`) + mensagem `tool` com `result` ou `error`, inclusive quando falha; persiste ao fim do job.
- Ação com `destructive: true` sem serviço `confirm` é recusada.
- Ação só com `parameters` (sem `input`) não tem os argumentos validados em runtime.
- `storageLocal`: salva após cada job, `maxMessages` 200, Blobs viram `omitted_media`; criptografado por padrão com a chave num cookie que expira (30 min, renovado a cada uso) ou no backend (`backendKey`); sem chave, o dado é apagado; retenção `'key'` (padrão), `{ ttlMinutes }` ou `'tab'`. Não protege contra XSS.
- `storageBackend`: GET/PUT/DELETE com `X-H4B-Conversation` e `X-H4B-Retention`; o servidor aplica a retenção.
- Serviço `retention` (ambos os storages): escolhas do desenvolvedor + `userChoices`, preferência no `localStorage`, painel 🔒 no widget.
- `tabSync`: `mode` `sync` (padrão; mesma thread → merge por id ordenado por `createdAt`; thread diferente → substitui), `notify` (`tabs.activity` + sinal de contexto `tab-sync.activity`), `off`.
- Transportes de chat enviam ações gravadas como `tool_calls` + mensagens `tool`; o `rasa` não envia histórico.
- O widget esconde mensagens sem texto/imagem/`ui` e mostra mensagens `tool` como cartões de ação (`showActions`).

## Documentação

Toda mudança de comportamento público atualiza no mesmo commit:

1. `docs/en-us/<página>.md` **e** `docs/pt-br/<página>.md`, com as mesmas seções e exemplos (exemplos em pt-br podem ter nomes em português).
2. Os sumários em `README.md` e `docs/pt-br/README.md` quando a página é nova.
3. `docs/*/plugins.md` para opções de pacote; `ROADMAP.md` para estado de implementação; um ADR para decisões de arquitetura.
4. `skills/` quando muda algo que quem integra precisa saber. As skills só afirmam comportamentos verificados no código: confirme de novo antes de editar.

Escreva o que o código faz hoje. Exemplos de código na documentação devem compilar: quando houver dúvida, copie o trecho para um arquivo temporário em `packages/core/test/` (importando de `../src/index.js`), rode `pnpm --filter @handsforbots/core typecheck` e apague o arquivo.
