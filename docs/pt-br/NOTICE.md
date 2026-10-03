## Projetos de terceiros

Os pacotes da v2 do Hands for Bots não embutem código de terceiros. Eles conversam com, ou são testados com, os projetos abaixo.

### Protocolos e integrações (peers opcionais)

| Projeto | Uso | Licença |
|---------|-----|---------|
| [AG-UI](https://github.com/ag-ui-protocol/ag-ui) (`@ag-ui/core`) | Protocol types for `transport-agui` | MIT |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) (`@copilotkit/react-core`) | Peer of `@handsforbots/copilotkit` | MIT |
| [React](https://react.dev) | Peer of `@handsforbots/react` | MIT |
| [OpenTelemetry](https://opentelemetry.io), [Grafana Faro](https://grafana.com/oss/faro/), [Langfuse](https://langfuse.com), [LangSmith](https://smith.langchain.com), [web-vitals](https://github.com/GoogleChrome/web-vitals) | Optional exporters of `semantic-event-observability` | Apache-2.0 / MIT |

### Desenvolvimento e demos

| Projeto | Uso | Licença |
|---------|-----|---------|
| [Rasa](https://rasa.com) 3.6 | Demo assistant (`examples/rasa`) | Apache-2.0 |
| [Vite](https://vitejs.dev) | Example dev servers | MIT |
| [vosk-server](https://github.com/alphacep/vosk-server) | Optional self-hosted speech recognition (`voskSTT`) | Apache-2.0 |
| [TypeScript](https://www.typescriptlang.org), [Vitest](https://vitest.dev), [jsdom](https://github.com/jsdom/jsdom), [Testing Library](https://testing-library.com), [Zod](https://zod.dev) | Build and tests | Apache-2.0 / MIT |

A v1 embutia web-storage, EasySpeech, vosk-browser, Marked e outros; eles saíram junto com a v1 (veja o histórico do git antes da branch v2).
