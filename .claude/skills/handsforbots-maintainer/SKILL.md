---
name: handsforbots-maintainer
description: Como trabalhar no código do Hands for Bots (H4B) neste repositório - arquitetura (Bot, BotOrchestrator, SessionManager, plugins, EventEmitter), convenções de código e commits, documentação bilíngue (docs/en-us + docs/pt-br + docs-dev), skills de integração em skills/ e como verificar mudanças sem suíte de testes no núcleo. Use em qualquer alteração em handsforbots/, docs/, docs-dev/ ou skills/, ou quando perguntarem como algo funciona por dentro da lib.
---

# Hands for Bots — manutenção

Biblioteca JavaScript (ES modules, sem build) para UI conversacional híbrida no navegador. O núcleo vive em `handsforbots/`; quem integra copia essa pasta para o próprio projeto. A estratégia de curto prazo (runtime headless embeddable, streaming, MCP, A2A) está em `ROADMAP.md` — confira antes de propor mudanças de arquitetura.

## Mapa do repositório

| Caminho | O que é |
|---|---|
| `handsforbots/Bot.js` | Fachada pública: opções, estado (`history`, `inputs`, `outputs`, `queue`), barramento de eventos, `BroadcastChannel`, cores |
| `handsforbots/Core/BotOrchestrator.js` | Carrega plugins, registra backend, `input`, `spreadOutput`, `extractActions`, fila, MCP |
| `handsforbots/Core/Backend/*.js` | `Rasa`, `OpenAI`, `UniversalLLM`, `InsecureLocalOllama` (escolhidos por `options.engine`) |
| `handsforbots/Core/Input|Output/<Nome>/<Nome>.js` | Plugins nativos (Text, Voice, Poke, BotsCommands) |
| `handsforbots/Plugins/Input|Output/<Nome>/<Nome>.js` | Plugins opcionais (GUIDed, Photo, Analytics, Observability, …) |
| `handsforbots/Libs/` | `EventEmitter`, `SessionManager` + `BotSessionAdapter` (histórico/sessão), `CryptoKeys`/`CriptoWorker` (AES-GCM), `MCPHelper`, voz |
| `handsforbots/Libs/SemanticEventObservability/` | Pacote independente com `package.json` e testes `node:test` |
| `docs/en-us`, `docs/pt-br` | Documentação pública, espelhada nos dois idiomas |
| `docs-dev/` | Documentação interna em português, com diagramas Mermaid do fluxo assíncrono |
| `skills/` | Skills para quem **integra** a lib (copiadas para `.claude/skills` do projeto consumidor) |
| `examples/` | Playground Docker (Rasa + Vite + nginx) e stack de observabilidade |

## Fluxo principal

`new Bot(options)` → `registerBackend` (async, dispara `core.loaded`) → `loadPlugins`: importa cada plugin por caminho (`../Core|Plugins/<Tipo>/<Nome>/<Nome>.js`), chama `ui()` de todos, `await rebuildHistory()` → `core.history_loaded` → `presentation` se o histórico estiver vazio.

Mensagem do usuário: plugin dispara `core.input` (grava `input` no histórico) e `core.send_to_backend` → `sendToBackend` (fila se `calling_backend`) → `backend.send` → `mcpHelper.processIfHasTools` → evento `trigger` do plugin → `core.spread_output` → `extractActions` (`[•…•]` → `msg.do`) → grava `output` → `core.output_ready`.

Histórico: `Bot.addToHistory` → `BotSessionAdapter` → `SessionManager.addToHistory` → `bot.history.push` → criptografa no Worker → `localStorage` (`bot-storage/history`). O getter/setter `history` do SessionManager aponta para `bot.history`.

Detalhes com diagramas: `docs-dev/01-bot.md` a `04-libs.md`.

## Armadilhas conhecidas (não "consertar" sem querer, nem esquecer)

Comportamentos atuais que a documentação e as skills descrevem. Se mudar algum, atualize `docs/*/history.md`, `docs/*/events.md`, `skills/` e esta lista no mesmo commit.

- **EventEmitter** (Bruno Simon): remove `_` e `-` dos nomes; `a.b` = evento `a`, namespace `b`; `trigger('a')` dispara todos os namespaces; `trigger('a.b')` lança `TypeError` se o namespace `b` existe sem ouvintes de `a`; argumentos que não são array são descartados.
- **SessionManager.encrypt/decrypt** substituem `cryptoWorker.onmessage` a cada chamada: gravações sobrepostas deixam uma promise pendente para sempre e o storage com snapshot antigo.
- **`addToHistory` antes de `rebuildHistory`** sobrescreve o histórico salvo.
- **Expiração** (`clearSessionIfExpired` → `clearSession`) não dispara `core.history_cleared`; só `bot.clearStorage()` dispara.
- **Itens de histórico** não têm `ts` nem `id`; abas não sincronizam histórico (última gravação vence).
- **BotsCommands.output**: chama métodos de plugin desacoplados (`fn(params)`, sem `this`); se a função retorna Promise, `response = {...}` lança `ReferenceError` (variável não declarada) e `core.action_success` nunca sai; `rebuildHistory` reexecuta todos os comandos no reload sem sinalizar que é replay.
- **Text.rebuildHistory** chama `title.trim()` em todo item `input`; payload objeto sem `title` derruba o redesenho do chat.
- `session_timeout` é fixo em 30 min em `Bot.js` (não é opção).

## Convenções de código

- JavaScript puro, ES modules, sem build nem TypeScript no núcleo. Imports relativos com extensão `.js`.
- Indentação com **tabs**. O código antigo usa espaços dentro de parênteses (`fn ( a, b )`, `if ( x )`); o código novo (Orchestrator, SessionManager) usa estilo compacto. Siga o estilo do arquivo que está editando.
- Comentários JSDoc acima dos métodos. Arquivos antigos em inglês; módulos novos em português. Mantenha o idioma do arquivo.
- Logs de console seguem o padrão `[✔︎]`, `[✘]`, `[ℹ]`, `[⚠]`.
- Plugins: nome só com letras e números; pasta, arquivo e classe idênticos; `constructor(bot, options)`; `ui(options)` sempre dispara `core.ui_loaded`.
- Eventos novos: `prefixo.nome` com namespace próprio; sempre passe array em `trigger`.
- Commits no estilo Conventional Commits, em inglês, terminando com ponto: `feat(scope): ...`, `fix(scope): ...`, `docs: ...`, `chore: ...`.

## Documentação bilíngue

Toda mudança de comportamento público atualiza, no mesmo commit:

1. `docs/en-us/<página>.md` **e** `docs/pt-br/<página>.md`, com a mesma estrutura de seções. Cabeçalho padrão: link "docs' home"/"home dos docs" e os badges `pt-BR` / `en-US` apontando um para o outro.
2. O sumário em `README.md` (en) e `docs/pt-br/README.md` quando a página é nova.
3. `docs-dev/` quando muda o fluxo interno (diagramas Mermaid em português).
4. `skills/handsforbots*/` quando muda algo que quem integra precisa saber (API, eventos, armadilhas). As skills afirmam comportamentos verificados no código: confira de novo antes de editar.

Escreva o que o código faz hoje, não o que deveria fazer. Se encontrar um bug ao documentar, documente o comportamento atual como limitação e registre o bug à parte.

## Como verificar mudanças

Não há suíte de testes para o núcleo. Antes de commitar:

- **Lógica isolada** (EventEmitter, SessionManager, BotsCommands, extractActions): script Node em diretório temporário importando o módulo com mocks mínimos (`globalThis.localStorage`, Worker falso com `postMessage`/`onmessage`, `bot = { history: [], eventEmitter }`). Rode com `node arquivo.mjs`. Foi assim que os comportamentos acima foram confirmados.
- **Observability**: `cd handsforbots/Libs/SemanticEventObservability && npm test` (equivale a `node --test test/*.test.js`).
- **Integração no navegador**: playground em `examples/` (`docker-compose up -d`, abrir `http://localhost/`; o Vite serve `examples/vite/src`). Teste sempre um reload no meio da conversa (redesenho do chat, replay de comandos, histórico).
- Releia o diff procurando: `trigger` sem array, nomes de evento sem namespace próprio, `ui()` sem `core.ui_loaded`, escrita no histórico antes de `core.history_loaded`, chaves de API no front-end.
