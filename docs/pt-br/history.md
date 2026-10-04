# Histórico

O histórico do H4B é a lista de mensagens da conversa: `h4b.messages`. Ele guarda o que o usuário disse, o que o assistente respondeu e **cada ação executada**, venha ela do assistente, do usuário (comandos diretos, botões, `runAction`) ou de um agente externo. É o mesmo histórico que vai para o backend a cada turno, que o widget desenha e que o `storage-local` salva.

Este guia mostra como ler o histórico, como registrar nele eventos da sua interface que não passam pela IA e como montar uma linha do tempo de decisões.

## Mensagens

| `role` | Quando entra | Campos úteis |
|---|---|---|
| `user` | Um sinal trigger inicia um turno | `parts`, `modality`, `source`, `signalId`, `route`, `createdAt` |
| `assistant` | O backend (ou um comando direto) responde | `parts`, `toolCalls`, `streaming`, `route`, `createdAt` |
| `tool` | Uma ação terminou | `toolCallId`, `name`, `result` ou `error`, `route`, `createdAt` |

Toda mensagem tem `id` e `createdAt`. A `route` diz como o turno foi resolvido: `transport`, `direct`, `capture`, `agent` ou `push` (veja [Conceitos](./concepts.md#rotas)). Os argumentos de uma ação ficam no `toolCalls` da mensagem `assistant`; o resultado fica na mensagem `tool` com o mesmo `toolCallId`.

As mensagens são imutáveis: cada mudança troca o array e os objetos alterados, então dá para comparar por referência.

## Lendo

```ts
h4b.messages                                           // array atual
h4b.on('messages.changed', (messages) => desenhar(messages))
const off = h4b.subscribe(() => desenhar(h4b.getSnapshot().messages))
```

No React: `useMessages()` de `@handsforbots/react`.

`messages.changed` dispara a cada pedaço de texto em streaming. Se a sua tela de histórico for pesada, filtre ou agrupe as atualizações.

## Registrando eventos da sua interface

Escolha o mecanismo pelo que você precisa:

| Você quer… | Use | Fica no histórico? | O modelo vê? | O widget mostra? |
|---|---|---|---|---|
| Registrar uma decisão do usuário (filtro, seleção, aprovação) | `h4b.runAction(nome, args)` | Sim: tool call + resultado, rota `direct` | Sim, a partir do turno seguinte | `⚡ ação direta <nome>` (`showActions: false` esconde) |
| Dizer ao assistente o que está na tela agora | Sinal de contexto (`kind: 'context'`) | Não | Sim, em todo turno, até ser substituído ou removido | Não |
| Mostrar uma mensagem do assistente fora de um turno | `h4b.push([...estímulos])` | Sim: mensagem `assistant`, rota `push` | Sim | Sim |
| Fazer uma pergunta ao assistente em nome do usuário | `h4b.ask(...)` / `h4b.send(...)` | Sim: mensagem `user` + resposta | Sim | Sim (se houver texto) |

"O modelo vê" vale para os transportes que enviam o histórico: `agui`, `http`, `universalLLM`, `openAICompatible`, `aiSdk` e a ponte do CopilotKit. O `rasa` só envia o texto do turno: o histórico fica no tracker do Rasa e os sinais de contexto vão em `metadata.h4b_context`.

### Decisões do usuário com `runAction`

`runAction` executa uma ação registrada pela mesma fila dos turnos e grava a chamada e o resultado no histórico. É o caminho certo para eventos que você quer reencontrar depois e que o assistente deve conhecer.

O ideal é que a sua interface já passe pela ação: assim o mesmo `filter_orders` serve ao usuário, ao assistente e a agentes do navegador.

```ts
h4b.actions.register({
  name: 'filter_orders',
  description: 'Filtra os pedidos por status',
  input: z.object({ status: z.enum(['open', 'late', 'closed']) }),
  handler: ({ status }) => tabela.filtrar(status),
})

seletorDeStatus.addEventListener('change', (e) => {
  void h4b.runAction('filter_orders', { status: e.target.value })
})
```

Quando a interface já mudou sozinha (um componente de terceiros, uma navegação) e você só quer **registrar** a decisão, use uma ação de registro, visível só para o usuário:

```ts
h4b.actions.register({
  name: 'record_decision',
  description: 'Decisão tomada pelo usuário na interface',
  exposeTo: ['user'],            // o assistente não pode chamá-la
  handler: (decision) => decision, // nada a fazer: o resultado é o próprio registro
})

void h4b.runAction('record_decision', { tipo: 'plano', valor: 'pro', rotulo: 'Escolheu o plano Pro' })
```

Os botões declarativos do plugin `gui()` de `@handsforbots/inputs` fazem o mesmo sem código: `<button data-h4b-command="filter_orders" data-h4b-args='{"status":"late"}'>`.

### O que saber antes

- **`runAction` entra na fila.** Se um turno do LLM está rodando, a ação só executa (e só aparece no histórico) quando ele termina. Para uma resposta instantânea na tela, atualize a interface no seu código e registre com uma ação de registro. As ações pendentes não aparecem em `getSnapshot().queued`, que lista só sinais.
- **Falhas também ficam registradas.** Ação inexistente, não exposta ao usuário, argumentos inválidos, confirmação recusada ou cancelada por um interceptador `action.before`: tudo vira uma mensagem `tool` com `error`, mostrada pelo widget e enviada ao modelo. `runAction` nunca lança; confira `outcome.error`.
- **`exposeTo: ['user']` tira a ação da lista de ferramentas do assistente**, mas as chamadas já registradas continuam indo no histórico. Os transportes compatíveis com OpenAI as enviam como `tool_calls`; confirme que o seu backend aceita uma tool call de uma ferramenta que não está em `tools`.
- **Não use `h4b.conversation.append` direto.** Fica fora da fila (pode se misturar com uma resposta em streaming), não dispara `turn.status` e só é salvo pelo storage no fim do próximo turno.
- **Sem segredos.** Argumentos e resultados vão para o backend e, com `storage-local`, para o `localStorage` sem criptografia. Use um interceptador `request.before` para ocultar dados pessoais.

## Persistência, abas e limites

- `storageLocal({ ttlMinutes: 30, maxMessages: 200 })` salva o histórico no fim de cada turno, ação ou push e o restaura no `start()`. Depois de `ttlMinutes` sem atividade, a conversa recomeça. Só as últimas `maxMessages` mensagens são guardadas: cada `runAction` ocupa **duas** (a chamada e o resultado). Se a sua linha do tempo precisa de mais, aumente o limite ou guarde as decisões também no seu backend.
- Blobs (fotos, áudio) viram marcadores `omitted_media` ao salvar.
- `tabSync()` junta os históricos das abas pelo `id` das mensagens, em ordem de criação; nada se perde entre abas. Um `reset()` em uma aba troca a conversa nas outras.
- `h4b.reset()` começa uma conversa nova e apaga o histórico salvo.

## Linha do tempo de decisões

Para navegar entre decisões, junte cada tool call ao seu resultado:

```ts
import type { Message } from '@handsforbots/core'

function decisoes(messages: Message[]) {
  const resultados = new Map(
    messages.flatMap((m) => (m.role === 'tool' ? [[m.toolCallId, m] as const] : [])),
  )
  return messages.flatMap((m) =>
    m.role === 'assistant' && m.route === 'direct'
      ? (m.toolCalls ?? []).map((call) => ({
          id: call.id,
          acao: call.name,
          args: call.args,
          resultado: resultados.get(call.id)?.result,
          erro: resultados.get(call.id)?.error,
          em: resultados.get(call.id)?.createdAt ?? m.createdAt,
        }))
      : [],
  )
}

h4b.on('messages.changed', (messages) => desenharLinhaDoTempo(decisoes(messages)))
```

Troque `m.route === 'direct'` por `true` para incluir também as ações do assistente (`transport`) e de agentes (`agent`).

O histórico só cresce: não há API para editar ou apagar uma mensagem. Para "voltar" a uma decisão, restaure o estado da interface a partir dos `args` daquele item e registre a volta como uma nova decisão (por exemplo, `runAction('filter_orders', args)` de novo).
