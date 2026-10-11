## Third-party projects

Every third-party package that Hands for Bots v2 ships, depends on, integrates with or uses to build, test and demo itself. Specifications, papers, laws and design inspirations are in [References](./docs/en-us/references.md).

`test/third-party.test.ts` fails when a `package.json` in `packages/` or `examples/` lists a package that is not in this file (and in [`docs/pt-br/NOTICE.md`](./docs/pt-br/NOTICE.md)).

### Code included in this repository

| Project | Where | License |
|---------|-------|---------|
| [Standard Schema](https://standardschema.dev) v1 type definitions | `packages/core/src/standard-schema.ts`, copied as the spec recommends | MIT |
| [Rasa financial-demo](https://github.com/RasaHQ/financial-demo) | `examples/rasa`, adapted (its own `LICENSE` is kept there) | Apache-2.0 |

No other third-party code is bundled in the published packages.

### Runtime dependencies

| Project | Use | License |
|---------|-----|---------|
| [AG-UI](https://github.com/ag-ui-protocol/ag-ui) (`@ag-ui/core`) | Protocol types and event schemas for `transport-agui` | MIT |

### Optional peers and integrations

Installed by the host app only when it uses the matching package or provider.

| Project | Use | License |
|---------|-----|---------|
| [React](https://react.dev) (`react`) | Peer of `@handsforbots/react`, `copilotkit`, `assistant-ui` | MIT |
| [Vue](https://vuejs.org) (`vue`) | Peer of `@handsforbots/vue` | MIT |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) (`@copilotkit/react-core`) | Peer of `@handsforbots/copilotkit` | MIT |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) (`@assistant-ui/react`) | Peer of `@handsforbots/assistant-ui` | MIT |
| [vosk-browser](https://github.com/ccoreilly/vosk-browser) (`vosk-browser`) | Offline speech recognition in `voice` (`voskBrowserSTT`), loaded by the host | Apache-2.0 |
| [OpenTelemetry](https://opentelemetry.io) (`@opentelemetry/api`) | Optional exporter of `semantic-event-observability` | Apache-2.0 |
| [Grafana Faro](https://grafana.com/oss/faro/) (`@grafana/faro-web-sdk`) | Optional exporter of `semantic-event-observability` | Apache-2.0 |
| [Langfuse](https://langfuse.com) (`@langfuse/tracing`) | Optional exporter of `semantic-event-observability` | MIT |
| [LangSmith](https://smith.langchain.com) (`langsmith`) | Optional exporter of `semantic-event-observability` | MIT |
| [web-vitals](https://github.com/GoogleChrome/web-vitals) (`web-vitals`) | Optional metrics of `semantic-event-observability` | Apache-2.0 |
| [Vitest](https://vitest.dev) (`vitest`) | Peer of `@handsforbots/testkit` | MIT |

### Development, tests and demos

| Project | Use | License |
|---------|-----|---------|
| [TypeScript](https://www.typescriptlang.org) (`typescript`) | Build and typecheck | Apache-2.0 |
| [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) (`@types/*`) | Type definitions | MIT |
| [Vitest](https://vitest.dev) (`vitest`) | Tests | MIT |
| [jsdom](https://github.com/jsdom/jsdom) (`jsdom`) | DOM in tests | MIT |
| [Testing Library](https://testing-library.com) (`@testing-library/react`) | React tests | MIT |
| [Zod](https://zod.dev) (`zod`) | Schemas in tests and examples | MIT |
| [React DOM](https://react.dev) (`react-dom`) | React tests and `examples/react-agui` | MIT |
| [AG-UI](https://github.com/ag-ui-protocol/ag-ui) (`@ag-ui/client`, `@ag-ui/encoder`) | `transport-agui` tests and the mock agent of `examples/react-agui` | MIT |
| [Vercel AI SDK](https://ai-sdk.dev) (`ai`) | `transport-ai-sdk` tests against the real `streamText` | Apache-2.0 |
| [RxJS](https://rxjs.dev) (`rxjs`) | `copilotkit` tests | Apache-2.0 |
| [Vite](https://vitejs.dev) (`vite`, `@vitejs/plugin-react`) | Example dev servers | MIT |
| [OpenTelemetry JS](https://github.com/open-telemetry/opentelemetry-js) (`@opentelemetry/context-zone`, `@opentelemetry/exporter-metrics-otlp-http`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/instrumentation`, `@opentelemetry/instrumentation-fetch`, `@opentelemetry/resources`, `@opentelemetry/sdk-metrics`, `@opentelemetry/sdk-trace-base`, `@opentelemetry/sdk-trace-web`, `@opentelemetry/semantic-conventions`) | Observability in `examples/vite` | Apache-2.0 |
| [Rasa](https://rasa.com) 3.6 | Demo assistant (`examples/rasa`, Python dependencies in its `requirements*.txt`) | Apache-2.0 |
| [vosk-server](https://github.com/alphacep/vosk-server) | Optional self-hosted speech recognition (`voskSTT`) | Apache-2.0 |
| [Duckling](https://github.com/facebook/duckling) (`rasa/duckling` image), [nginx](https://nginx.org) | Containers of `examples/docker-compose.yml` | BSD-3-Clause / BSD-2-Clause |

v1 bundled web-storage, EasySpeech, vosk-browser, Marked and others; they were removed with v1 (see git history before the v2 branch).
