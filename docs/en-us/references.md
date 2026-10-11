# References

The specifications, papers, laws and projects that Hands for Bots v2 implements, follows or took ideas from. Software packages and their licenses are in [Third-party projects](../../NOTICE.md).

When a change implements a spec, an algorithm or a legal rule, or borrows a design from another project, add it here and to [`docs/pt-br/references.md`](../pt-br/references.md) in the same commit, and cite it in a code comment next to the implementation.

## Design inspirations and prior work

| Reference | Where it shows up |
|-----------|-------------------|
| Hands for Bots v1 (`main` branch, discontinued) | Problem statement, UniversalLLM request format (`universalLLM`), [migration map](./migrating-from-v1.md) |
| [Cordis](https://github.com/cordiverse/cordis): plugin and service semantics (`name`, `inject`, `apply(ctx)`, scoped disposal) | Kernel and `definePlugin` ([ADR 0001](../adr/0001-kernel-proprio-semantica-cordis.md)) |
| DeepSeek Harness: "everything is a plugin", including the loop and the transport | Plugin format ([ADR 0001](../adr/0001-kernel-proprio-semantica-cordis.md), `ROADMAP.md`) |
| [AG-UI](https://docs.ag-ui.com), [CopilotKit](https://docs.copilotkit.ai), [Vercel AI SDK](https://ai-sdk.dev), [assistant-ui](https://www.assistant-ui.com) | Internal message model kept close to AG-UI; adapters ([ADR 0006](../adr/0006-adapters-substituiveis.md)) |

## Protocols and specifications

| Reference | Where it shows up |
|-----------|-------------------|
| [AG-UI protocol](https://docs.ag-ui.com) | `transport-agui`, `copilotkit` |
| [Model Context Protocol](https://modelcontextprotocol.io) and its MCP Apps extension (`ui://` resources, `text/html;profile=mcp-app`) | `mcp-apps` |
| [WebMCP](https://github.com/webmachinelearning/webmcp), W3C Web Machine Learning Community Group draft (`navigator.modelContext`) | `expose-webmcp` |
| [Standard Schema](https://standardschema.dev) v1 | Action input and plugin config validation (`packages/core/src/standard-schema.ts`) |
| [JSON Schema](https://json-schema.org/draft/2020-12) draft 2020-12 | `toJsonSchema`, tool definitions sent to models and agents |
| P. Bryan, M. Nottingham (eds.). [RFC 6902: JavaScript Object Notation (JSON) Patch](https://www.rfc-editor.org/rfc/rfc6902). IETF, 2013 | Shared state (`packages/core/src/patch.ts`) |
| P. Bryan, K. Zyp, M. Nottingham (eds.). [RFC 6901: JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901). IETF, 2013 | Paths in JSON Patch operations |
| [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat) request and stream format | `openAICompatible` (also Ollama and other compatible servers) |
| [Rasa REST channel](https://rasa.com/docs/rasa/connectors/your-own-website/) (`/webhooks/rest/webhook`) | `transport-rasa` |
| [OpenTelemetry](https://opentelemetry.io/docs/specs/) specification and semantic conventions | `observability`, `semantic-event-observability` |

## Web platform

| Reference | Where it shows up |
|-----------|-------------------|
| [Web Speech API](https://webaudio.github.io/web-speech-api/) (W3C Community Group report) | `webSpeechSTT`, `webSpeechTTS` |
| [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) (`getUserMedia`) | `voice` providers, `inputs` camera |
| [Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/) (AES-GCM) | `storage-local` encryption |
| [HTML Living Standard](https://html.spec.whatwg.org): `BroadcastChannel`, server-sent events, `iframe` `sandbox` | `tab-sync`, consent across tabs, streaming transports, `mcp-apps` |
| [Content Security Policy Level 3](https://www.w3.org/TR/CSP3/) | `mcp-apps` |
| [Geolocation API](https://www.w3.org/TR/geolocation/), [DeviceOrientation Event](https://www.w3.org/TR/orientation-event/) | `inputs` sensors |
| [Unicode Standard Annex #15: Unicode Normalization Forms](https://unicode.org/reports/tr15/) (NFD) | Accent-insensitive matching in `menu` |

## Algorithms

| Reference | Where it shows up |
|-----------|-------------------|
| V. I. Levenshtein. Binary codes capable of correcting deletions, insertions, and reversals. *Soviet Physics Doklady* 10(8):707–710, 1966 | Fuzzy command matching (`packages/menu/src/fuzzy.ts`) |
| F. J. Damerau. A technique for computer detection and correction of spelling errors. *Communications of the ACM* 7(3):171–176, 1964. [doi:10.1145/363958.363994](https://doi.org/10.1145/363958.363994) | Adjacent transpositions in the same distance (optimal string alignment) |

## Legislation

The consent presets encode a reading of these laws as defaults. They are not legal advice; see [Consent](./consent.md).

| Reference | Where it shows up |
|-----------|-------------------|
| Brazil. [Lei nº 13.709, de 14 de agosto de 2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) (Lei Geral de Proteção de Dados Pessoais, LGPD) | `lgpd` preset |
| European Union. [Regulation (EU) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj) (General Data Protection Regulation, GDPR) and [Directive 2002/58/EC](https://eur-lex.europa.eu/eli/dir/2002/58/oj) (ePrivacy) | `gdpr` preset |
| California. [California Consumer Privacy Act of 2018](https://oag.ca.gov/privacy/ccpa) (Cal. Civ. Code § 1798.100 et seq.), as amended by the California Privacy Rights Act of 2020 (CCPA/CPRA) | `ccpa` preset |
