<div align="center"><img src="./docs/hands-for-bots-cover.png" alt="[•_•] Hands for Bots" style="max-width: 100%;width: 700px;margin: auto;display: block;"></div>

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./docs/pt-br/README.md)
[![en-US](https://img.shields.io/badge/en-US-white)](./README.md)

</div>

<div align="center">

![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) &nbsp; ![Collaborative GUI](https://img.shields.io/badge/🖐-Collaborative_GUI-purple?style=social) &nbsp; ![Multimodal](https://img.shields.io/badge/🎙-Multimodal-purple?style=social)

[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org) &nbsp; [![MIT License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge&color=%23750014)](./LICENSE.md) &nbsp; [![GitHub Repo](https://img.shields.io/badge/github-%23323330.svg?style=for-the-badge&logo=github&logoColor=%23FFFFFF)](https://github.com/alexlana/handsforbots)

</div>

**Hands for Bots** gives assistants hands: a headless, plugin-based layer between people, your GUI and any agent.

- **Any input becomes a signal**: keyboard, voice (browser or cloud), photos, video frames, files, sensors, GUI events.
- **Any backend answers with messages and/or stimuli for the UI**: AG-UI, CopilotKit, Rasa, your own HTTP API, OpenAI-compatible LLMs.
- **Your GUI's actions are declared once** and become available to the in-app assistant (tool calls), to the user as instant commands (no LLM round trip, still in history) and to browser agents (WebMCP), under the same validation, confirmation and origin rules.

It is not a chat window. Use the ready-made `<h4b-chat>` widget, your own components (React bindings included) or CopilotKit's chat, and keep the collaboration on the page itself: guided tours, highlights, filters, galleries.

```ts
import { createH4B } from '@handsforbots/core'
import { agui } from '@handsforbots/transport-agui'
import { voice, webSpeechSTT, webSpeechTTS } from '@handsforbots/voice'
import { menu } from '@handsforbots/menu'
import { widget } from '@handsforbots/widget'

const h4b = createH4B({
  plugins: [
    agui({ url: '/api/agent' }),
    voice({ stt: webSpeechSTT(), tts: webSpeechTTS(), language: 'en-US' }),
    menu({ commands: [{ action: 'filter_orders', label: 'Late orders', slash: 'late', args: { status: 'late' } }] }),
    widget({ botName: 'Assistant' }),
  ],
  actions: [{ name: 'filter_orders', description: 'Filters orders by status', handler: ({ status }) => table.filter(status) }],
})
await h4b.start()
```

## Documentation

- [Getting started](./docs/en-us/getting-started.md)
- [Concepts](./docs/en-us/concepts.md): signals, turns, stimuli, routes, sync/async
- [Plugins](./docs/en-us/plugins.md): every package and its options
- [Writing plugins](./docs/en-us/writing-plugins.md)
- [Security](./docs/en-us/security.md)
- [Development](./docs/en-us/development.md)
- [Migrating from v1](./docs/en-us/migrating-from-v1.md)
- [Roadmap](./ROADMAP.md) (architecture, decisions, status; Portuguese)

## Examples

- [`examples/react-agui`](./examples/react-agui/README.md): React dashboard where the assistant works on the GUI through AG-UI, with direct commands, voice, keyboard shortcuts and WebMCP. Runs with a built-in mock agent: `pnpm install && pnpm --filter @handsforbots/example-react-agui dev`.
- [`examples/vite`](./examples/README.md): Rasa + `<h4b-chat>` widget + guided tours + observability (Docker).

## Acknowledgment

Grateful for the authors of [these third-party projects](./NOTICE.md).
