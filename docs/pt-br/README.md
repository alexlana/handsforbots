<div align="center"><img src="../hands-for-bots-cover.png" alt="[•_•] Hands for Bots" style="max-width: 100%;width: 700px;margin: auto;display: block;"></div>

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./README.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../../README.md)

</div>

O **Hands for Bots** dá mãos aos assistentes: uma camada headless, baseada em plugins, entre as pessoas, a sua interface e qualquer agente.

- **Qualquer entrada vira um sinal**: teclado, voz (do navegador ou na nuvem), fotos, quadros de vídeo, arquivos, sensores, eventos da interface.
- **Qualquer backend responde com mensagens e/ou estímulos para a UI**: AG-UI, CopilotKit, Rasa, sua própria API HTTP, LLMs compatíveis com OpenAI.
- **As ações da sua interface são declaradas uma vez** e ficam disponíveis para o assistente do app (tool calls), para o usuário como comandos instantâneos (sem passar pelo LLM, mas no histórico) e para agentes do navegador (WebMCP), sob as mesmas regras de validação, confirmação e origem.

Não é uma janela de chat. Use o widget pronto `<h4b-chat>`, seus próprios componentes (há bindings para React) ou o chat do CopilotKit, e mantenha a colaboração na própria página: tours guiados, destaques, filtros, galerias.

```ts
import { createH4B } from '@handsforbots/core'
import { agui } from '@handsforbots/transport-agui'
import { voice, webSpeechSTT, webSpeechTTS } from '@handsforbots/voice'
import { menu } from '@handsforbots/menu'
import { widget } from '@handsforbots/widget'

const h4b = createH4B({
  plugins: [
    agui({ url: '/api/agent' }),
    voice({ stt: webSpeechSTT(), tts: webSpeechTTS(), language: 'pt-BR' }),
    menu({ language: 'pt-br', commands: [{ action: 'filter_orders', label: 'Pedidos atrasados', slash: 'atrasados', args: { status: 'late' } }] }),
    widget({ botName: 'Assistente', language: 'pt-br' }),
  ],
  actions: [{ name: 'filter_orders', description: 'Filtra pedidos por status', handler: ({ status }) => tabela.filtrar(status) }],
})
await h4b.start()
```

## Documentação

- [Primeiros passos](./getting-started.md)
- [Conceitos](./concepts.md): sinais, turnos, estímulos, rotas, síncrono/assíncrono
- [Plugins](./plugins.md): todos os pacotes e opções
- [Escrevendo plugins](./writing-plugins.md)
- [Histórico](./history.md): leitura, registro de decisões da interface, linha do tempo
- [Segurança](./security.md)
- [Desenvolvimento](./development.md)
- [Migrando da v1](./migrating-from-v1.md)
- [Roadmap](../../ROADMAP.md) (arquitetura, decisões, estado)

## Exemplos

- [`examples/react-agui`](../../examples/react-agui/README.md): painel em React em que o assistente trabalha na interface via AG-UI, com comandos diretos, voz, atalhos de teclado e WebMCP. Roda com um agente simulado: `pnpm install && pnpm --filter @handsforbots/example-react-agui dev`.
- [`examples/vite`](../../examples/README.md): Rasa + widget `<h4b-chat>` + tours guiados + observabilidade (Docker).

## Agradecimentos

Aos autores [destes projetos de terceiros](./NOTICE.md).
