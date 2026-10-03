## Third-party projects

Hands for Bots v2 packages do not bundle third-party code. They talk to, or are tested with, the projects below.

### Protocols and integrations (optional peers)

| Project | Use | License |
|---------|-----|---------|
| [AG-UI](https://github.com/ag-ui-protocol/ag-ui) (`@ag-ui/core`) | Protocol types for `transport-agui` | MIT |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) (`@copilotkit/react-core`) | Peer of `@handsforbots/copilotkit` | MIT |
| [React](https://react.dev) | Peer of `@handsforbots/react` | MIT |
| [OpenTelemetry](https://opentelemetry.io), [Grafana Faro](https://grafana.com/oss/faro/), [Langfuse](https://langfuse.com), [LangSmith](https://smith.langchain.com), [web-vitals](https://github.com/GoogleChrome/web-vitals) | Optional exporters of `semantic-event-observability` | Apache-2.0 / MIT |

### Development and demos

| Project | Use | License |
|---------|-----|---------|
| [Rasa](https://rasa.com) 3.6 | Demo assistant (`examples/rasa`) | Apache-2.0 |
| [Vite](https://vitejs.dev) | Example dev servers | MIT |
| [vosk-server](https://github.com/alphacep/vosk-server) | Optional self-hosted speech recognition (`voskSTT`) | Apache-2.0 |
| [TypeScript](https://www.typescriptlang.org), [Vitest](https://vitest.dev), [jsdom](https://github.com/jsdom/jsdom), [Testing Library](https://testing-library.com), [Zod](https://zod.dev) | Build and tests | Apache-2.0 / MIT |

v1 bundled web-storage, EasySpeech, vosk-browser, Marked and others; they were removed with v1 (see git history before the v2 branch).
