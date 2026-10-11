## Projetos de terceiros

Todo pacote de terceiros que o Hands for Bots v2 inclui, de que depende, com que se integra ou que usa para build, testes e demos. Especificações, artigos, leis e inspirações de projeto estão em [Referências](./references.md).

O `test/third-party.test.ts` falha quando um `package.json` em `packages/` ou `examples/` lista um pacote que não está neste arquivo (e no [`NOTICE.md`](../../NOTICE.md) em inglês).

### Código incluído neste repositório

| Projeto | Onde | Licença |
|---------|------|---------|
| Definições de tipo do [Standard Schema](https://standardschema.dev) v1 | `packages/core/src/standard-schema.ts`, copiadas como a especificação recomenda | MIT |
| [Rasa financial-demo](https://github.com/RasaHQ/financial-demo) | `examples/rasa`, adaptado (com o `LICENSE` original mantido lá) | Apache-2.0 |

Nenhum outro código de terceiros é embutido nos pacotes publicados.

### Dependências de runtime

| Projeto | Uso | Licença |
|---------|-----|---------|
| [AG-UI](https://github.com/ag-ui-protocol/ag-ui) (`@ag-ui/core`) | Tipos do protocolo e schemas de eventos do `transport-agui` | MIT |

### Peers opcionais e integrações

Instalados pelo app hospedeiro só quando usa o pacote ou provedor correspondente.

| Projeto | Uso | Licença |
|---------|-----|---------|
| [React](https://react.dev) (`react`) | Peer de `@handsforbots/react`, `copilotkit`, `assistant-ui` | MIT |
| [Vue](https://vuejs.org) (`vue`) | Peer de `@handsforbots/vue` | MIT |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) (`@copilotkit/react-core`) | Peer de `@handsforbots/copilotkit` | MIT |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) (`@assistant-ui/react`) | Peer de `@handsforbots/assistant-ui` | MIT |
| [vosk-browser](https://github.com/ccoreilly/vosk-browser) (`vosk-browser`) | Reconhecimento de fala offline no `voice` (`voskBrowserSTT`), carregado pelo hospedeiro | Apache-2.0 |
| [OpenTelemetry](https://opentelemetry.io) (`@opentelemetry/api`) | Exportador opcional da `semantic-event-observability` | Apache-2.0 |
| [Grafana Faro](https://grafana.com/oss/faro/) (`@grafana/faro-web-sdk`) | Exportador opcional da `semantic-event-observability` | Apache-2.0 |
| [Langfuse](https://langfuse.com) (`@langfuse/tracing`) | Exportador opcional da `semantic-event-observability` | MIT |
| [LangSmith](https://smith.langchain.com) (`langsmith`) | Exportador opcional da `semantic-event-observability` | MIT |
| [web-vitals](https://github.com/GoogleChrome/web-vitals) (`web-vitals`) | Métricas opcionais da `semantic-event-observability` | Apache-2.0 |
| [Vitest](https://vitest.dev) (`vitest`) | Peer de `@handsforbots/testkit` | MIT |

### Desenvolvimento, testes e demos

| Projeto | Uso | Licença |
|---------|-----|---------|
| [TypeScript](https://www.typescriptlang.org) (`typescript`) | Build e typecheck | Apache-2.0 |
| [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) (`@types/*`) | Definições de tipo | MIT |
| [Vitest](https://vitest.dev) (`vitest`) | Testes | MIT |
| [jsdom](https://github.com/jsdom/jsdom) (`jsdom`) | DOM nos testes | MIT |
| [Testing Library](https://testing-library.com) (`@testing-library/react`) | Testes de React | MIT |
| [Zod](https://zod.dev) (`zod`) | Schemas em testes e exemplos | MIT |
| [React DOM](https://react.dev) (`react-dom`) | Testes de React e `examples/react-agui` | MIT |
| [AG-UI](https://github.com/ag-ui-protocol/ag-ui) (`@ag-ui/client`, `@ag-ui/encoder`) | Testes do `transport-agui` e agente simulado do `examples/react-agui` | MIT |
| [Vercel AI SDK](https://ai-sdk.dev) (`ai`) | Testes do `transport-ai-sdk` contra o `streamText` real | Apache-2.0 |
| [RxJS](https://rxjs.dev) (`rxjs`) | Testes do `copilotkit` | Apache-2.0 |
| [Vite](https://vitejs.dev) (`vite`, `@vitejs/plugin-react`) | Servidores de desenvolvimento dos exemplos | MIT |
| [OpenTelemetry JS](https://github.com/open-telemetry/opentelemetry-js) (`@opentelemetry/context-zone`, `@opentelemetry/exporter-metrics-otlp-http`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/instrumentation`, `@opentelemetry/instrumentation-fetch`, `@opentelemetry/resources`, `@opentelemetry/sdk-metrics`, `@opentelemetry/sdk-trace-base`, `@opentelemetry/sdk-trace-web`, `@opentelemetry/semantic-conventions`) | Observabilidade no `examples/vite` | Apache-2.0 |
| [Rasa](https://rasa.com) 3.6 | Assistente de demonstração (`examples/rasa`, dependências Python nos `requirements*.txt` de lá) | Apache-2.0 |
| [vosk-server](https://github.com/alphacep/vosk-server) | Reconhecimento de fala auto-hospedado opcional (`voskSTT`) | Apache-2.0 |
| [Duckling](https://github.com/facebook/duckling) (imagem `rasa/duckling`), [nginx](https://nginx.org) | Contêineres do `examples/docker-compose.yml` | BSD-3-Clause / BSD-2-Clause |

A v1 embutia web-storage, EasySpeech, vosk-browser, Marked e outros; eles saíram junto com a v1 (veja o histórico do git antes da branch v2).
