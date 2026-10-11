# Referências

As especificações, artigos, leis e projetos que o Hands for Bots v2 implementa, segue ou dos quais tirou ideias. Pacotes de software e suas licenças estão em [Projetos de terceiros](./NOTICE.md).

Quando uma mudança implementar uma especificação, um algoritmo ou uma regra legal, ou aproveitar um desenho de outro projeto, acrescente aqui e em [`docs/en-us/references.md`](../en-us/references.md) no mesmo commit, e cite a referência num comentário de código junto da implementação.

## Inspirações e trabalhos anteriores

| Referência | Onde aparece |
|------------|--------------|
| Hands for Bots v1 (branch `main`, descontinuada) | Definição do problema, formato de requisição UniversalLLM (`universalLLM`), [mapa de migração](./migrating-from-v1.md) |
| [Cordis](https://github.com/cordiverse/cordis): semântica de plugins e serviços (`name`, `inject`, `apply(ctx)`, descarte por escopo) | Kernel e `definePlugin` ([ADR 0001](../adr/0001-kernel-proprio-semantica-cordis.md)) |
| DeepSeek Harness: "tudo é plugin", até o loop e o transporte | Formato de plugin ([ADR 0001](../adr/0001-kernel-proprio-semantica-cordis.md), `ROADMAP.md`) |
| [AG-UI](https://docs.ag-ui.com), [CopilotKit](https://docs.copilotkit.ai), [Vercel AI SDK](https://ai-sdk.dev), [assistant-ui](https://www.assistant-ui.com) | Modelo interno de mensagens próximo do AG-UI; adapters ([ADR 0006](../adr/0006-adapters-substituiveis.md)) |

## Protocolos e especificações

| Referência | Onde aparece |
|------------|--------------|
| [Protocolo AG-UI](https://docs.ag-ui.com) | `transport-agui`, `copilotkit` |
| [Model Context Protocol](https://modelcontextprotocol.io) e a extensão MCP Apps (recursos `ui://`, `text/html;profile=mcp-app`) | `mcp-apps` |
| [WebMCP](https://github.com/webmachinelearning/webmcp), rascunho do W3C Web Machine Learning Community Group (`navigator.modelContext`) | `expose-webmcp` |
| [Standard Schema](https://standardschema.dev) v1 | Validação de entrada de ações e de config de plugins (`packages/core/src/standard-schema.ts`) |
| [JSON Schema](https://json-schema.org/draft/2020-12) draft 2020-12 | `toJsonSchema`, definições de ferramentas enviadas a modelos e agentes |
| P. Bryan, M. Nottingham (eds.). [RFC 6902: JavaScript Object Notation (JSON) Patch](https://www.rfc-editor.org/rfc/rfc6902). IETF, 2013 | Estado compartilhado (`packages/core/src/patch.ts`) |
| P. Bryan, K. Zyp, M. Nottingham (eds.). [RFC 6901: JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901). IETF, 2013 | Caminhos das operações de JSON Patch |
| Formato de requisição e stream do [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat) | `openAICompatible` (também Ollama e outros servidores compatíveis) |
| [Canal REST do Rasa](https://rasa.com/docs/rasa/connectors/your-own-website/) (`/webhooks/rest/webhook`) | `transport-rasa` |
| Especificação e convenções semânticas do [OpenTelemetry](https://opentelemetry.io/docs/specs/) | `observability`, `semantic-event-observability` |

## Plataforma web

| Referência | Onde aparece |
|------------|--------------|
| [Web Speech API](https://webaudio.github.io/web-speech-api/) (relatório de Community Group do W3C) | `webSpeechSTT`, `webSpeechTTS` |
| [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) (`getUserMedia`) | Provedores do `voice`, câmera do `inputs` |
| [Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/) (AES-GCM) | Criptografia do `storage-local` |
| [HTML Living Standard](https://html.spec.whatwg.org): `BroadcastChannel`, server-sent events, `sandbox` de `iframe` | `tab-sync`, consentimento entre abas, transportes com streaming, `mcp-apps` |
| [Content Security Policy Level 3](https://www.w3.org/TR/CSP3/) | `mcp-apps` |
| [Geolocation API](https://www.w3.org/TR/geolocation/), [DeviceOrientation Event](https://www.w3.org/TR/orientation-event/) | Sensores do `inputs` |
| [Unicode Standard Annex #15: Unicode Normalization Forms](https://unicode.org/reports/tr15/) (NFD) | Comparação sem acentos no `menu` |

## Algoritmos

| Referência | Onde aparece |
|------------|--------------|
| V. I. Levenshtein. Binary codes capable of correcting deletions, insertions, and reversals. *Soviet Physics Doklady* 10(8):707–710, 1966 | Busca aproximada de comandos (`packages/menu/src/fuzzy.ts`) |
| F. J. Damerau. A technique for computer detection and correction of spelling errors. *Communications of the ACM* 7(3):171–176, 1964. [doi:10.1145/363958.363994](https://doi.org/10.1145/363958.363994) | Transposições adjacentes na mesma distância (optimal string alignment) |

## Legislação

Os presets de consentimento codificam uma leitura destas leis como padrão. Não são aconselhamento jurídico; veja [Consentimento](./consent.md).

| Referência | Onde aparece |
|------------|--------------|
| Brasil. [Lei nº 13.709, de 14 de agosto de 2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) (Lei Geral de Proteção de Dados Pessoais, LGPD) | Preset `lgpd` |
| União Europeia. [Regulamento (UE) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj) (Regulamento Geral sobre a Proteção de Dados, RGPD/GDPR) e [Diretiva 2002/58/CE](https://eur-lex.europa.eu/eli/dir/2002/58/oj) (ePrivacy) | Preset `gdpr` |
| Califórnia. [California Consumer Privacy Act of 2018](https://oag.ca.gov/privacy/ccpa) (Cal. Civ. Code § 1798.100 e seguintes), alterado pelo California Privacy Rights Act de 2020 (CCPA/CPRA) | Preset `ccpa` |
