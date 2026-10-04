##### [![Hands for Bots](https://img.shields.io/badge/[•__•]-Hands_for_Bots-purple?style=social) <br>&lt;&lt; home dos docs](./README.md)

<div align="right">

[![pt-BR](https://img.shields.io/badge/pt-BR-white)](./history.md)
[![en-US](https://img.shields.io/badge/en-US-white)](../en-us/history.md)

</div>


# Histórico da sessão

O Hands for Bots mantém um histórico de tudo que acontece na sessão: o que o usuário disse, o que o assistente respondeu, retornos de ferramentas MCP e, se você quiser, **eventos da sua própria interface**. O histórico fica em memória (`bot.history`), é salvo criptografado no `localStorage` e é usado para:

- redesenhar o chat quando a página recarrega (plugin Text);
- reexecutar comandos `[•…•]` já emitidos, restaurando o estado da GUI (plugin BotsCommands);
- dar contexto de conversa ao modelo (backend `universal-llm`).

Este guia mostra como ler o histórico, como acrescentar itens que não vêm da IA e quais cuidados tomar.


## Formato de um item

Cada item é um array de quatro posições:

```javascript
[ type, plugin, payload, title ]
```

| Posição | Campo | Descrição |
|---|---|---|
| 0 | `type` | Tipo do item. O núcleo usa `'input'`, `'output'` e `'feedback'`. Você pode usar tipos próprios. |
| 1 | `plugin` | Quem gerou o item. Uma string (`'Text'`, `'poke'`, `'mcp'`…) ou, em `output`, a lista de plugins de saída ativos. |
| 2 | `payload` | Os dados. Precisa ser serializável em JSON. |
| 3 | `title` | Texto opcional para exibição. Pode ser `null`. |

O que o núcleo grava:

| `type` | Quando | `payload` |
|---|---|---|
| `'input'` | Um plugin de entrada dispara `core.input` | O que o usuário enviou (string ou objeto) |
| `'output'` | O núcleo distribui uma resposta (`core.spread_output`) | **String JSON** de um array de mensagens (`[{ text, title, buttons, image, html, do, … }]`) |
| `'feedback'` | Uma ferramenta MCP devolve feedback | Texto do feedback; `plugin` é `'mcp'` |

> **Atenção:** os itens **não têm data nem identificador**. Se precisar ordenar por tempo ou referenciar um item, coloque `ts` e `id` dentro do seu `payload`.


## Lendo o histórico

```javascript
bot.history          // Array com todos os itens, em ordem de chegada
bot.history_loaded   // true depois que o histórico foi recuperado do storage
```

O histórico só é confiável **depois** do evento `core.history_loaded`, que acontece quando os plugins carregam e o histórico salvo é descriptografado:

```javascript
bot.eventEmitter.on( 'core.history_loaded', () => {
  render( bot.history )
})

bot.eventEmitter.on( 'core.history_added', () => {
  const ultimo = bot.history[ bot.history.length - 1 ]
  // o evento não envia o item; leia a última posição
})
```

Para normalizar os dois formatos de `payload`:

```javascript
function lerPayload ( item ) {
  const [ type, , payload ] = item
  if ( type === 'output' && typeof payload === 'string' ) {
    try { return JSON.parse( payload ) } catch ( e ) { return payload }
  }
  return payload
}
```


## Acrescentando eventos da sua interface

Use `bot.addToHistory`:

```javascript
await bot.addToHistory( type, plugin, payload, title = null )
```

- `type`, `plugin` e `payload` são obrigatórios. Valores vazios (`''`, `null`, `0`) lançam erro.
- Cada chamada renova a sessão e regrava o histórico inteiro, criptografado, no storage.
- Depois de gravar, o núcleo dispara `core.history_added`.

### Escolha do `type`

O `type` decide quem enxerga o item:

| Quem lê o histórico | O que considera | Um `type` próprio (ex.: `'ui_event'`) | `type: 'input'` com `plugin` próprio |
|---|---|---|---|
| Backend `universal-llm` (contexto do modelo) | só `input` e `output` | ignorado | **enviado** ao modelo como mensagem do usuário |
| Chat do plugin Text (ao recarregar) | `input` com `plugin: 'Text'` e `output` | ignorado | ignorado |
| BotsCommands (ao recarregar) | `output` com comando `do` | ignorado | ignorado |
| Seu código | tudo | disponível | disponível |

Os backends `rasa`, `openai` e `insecure-local-ollama` não leem o histórico local: o contexto deles fica no servidor.

**Só para navegação (o modelo não vê):**

```javascript
await bot.addToHistory(
  'ui_event',
  'MeuApp',
  { action: 'filtro_aplicado', data: { regiao: 'sul' }, ts: Date.now(), id: crypto.randomUUID() },
  'Filtrou por região Sul'
)
```

**Para o modelo também saber (backend `universal-llm`):**

```javascript
await bot.addToHistory(
  'input',
  'MeuApp',
  { text: 'O usuário aplicou o filtro região = Sul', ts: Date.now() },
  'Filtrou por região Sul'   // em itens 'input', informe sempre um title em texto
)
```

O modelo recebe `payload.text` (ou `payload.message` / `payload.content`); sem esses campos, recebe o objeto inteiro em JSON. Itens `input` e `output` contam na janela `engine_specific.dialog_context_window` (padrão `10`), então eventos de interface demais empurram a conversa real para fora do contexto.

### `addToHistory` ou `core.input`?

Disparar `core.input` também grava um item `input`, mas faz mais coisas: dispara `core.input_received`, avisa o plugin Analytics (`message_sent`) e **replica a entrada para outras abas**, onde o plugin Text a mostra como mensagem do usuário. Para eventos da interface, prefira `bot.addToHistory`.


## Cuidados importantes

### 1. Espere o histórico carregar

Se você chamar `addToHistory` antes de `core.history_loaded`, o item é gravado sobre um histórico ainda vazio e **apaga o histórico salvo** da sessão anterior. Espere o evento ou confira `bot.history_loaded`:

```javascript
function historicoPronto ( bot ) {
  if ( bot.history_loaded ) return Promise.resolve()
  return new Promise( resolve => bot.eventEmitter.on( 'core.history_loaded', () => resolve() ) )
}
```

### 2. Não faça gravações em paralelo

A criptografia usa um único Web Worker, e cada gravação substitui o `onmessage` dele. Se duas chamadas a `addToHistory` se sobrepõem, a primeira promise **nunca resolve** e o storage pode ficar sem o segundo item (a memória fica correta; a perda aparece quando a página recarrega). Grave um item por vez, com `await`, e use um tempo limite para não travar sua fila se uma gravação do núcleo coincidir com a sua:

```javascript
let fila = Promise.resolve()

function registrar ( bot, type, plugin, payload, title = null ) {
  const tarefa = fila.then( async () => {
    await historicoPronto( bot )
    await Promise.race([
      bot.addToHistory( type, plugin, payload, title ),
      new Promise( resolve => setTimeout( resolve, 3000 ) ),
    ])
  })
  fila = tarefa.catch( err => console.error( 'Falha ao registrar no histórico:', err ) )
  return tarefa
}
```

### 3. Expiração e limpeza

- A sessão expira depois de **30 minutos** sem interação (valor fixo). Qualquer `addToHistory` renova a sessão.
- Quando expira, o histórico é zerado em memória e no storage **sem disparar evento**. `core.history_cleared` só é disparado por `bot.clearStorage()`. Se a sua interface mostra o histórico, confira `bot.history.length` antes de usar dados antigos.
- Com `storage_side: 'backend'`, nada é salvo no navegador: o histórico existe só enquanto a página está aberta.

### 4. Várias abas

Cada aba guarda sua própria cópia de `bot.history` e grava a cópia inteira no storage. Itens adicionados em uma aba não aparecem nas outras, e a última aba a gravar vence. Se o seu app costuma ficar aberto em várias abas, não use o histórico como única fonte de verdade.

### 5. Dados sensíveis

O histórico é criptografado, mas a chave fica no próprio navegador (storage + cookie). Não grave senhas, tokens ou dados que não podem ficar no dispositivo do usuário.


## Exemplo completo: linha do tempo de decisões

```javascript
import Bot from './handsforbots/Bot.js'

const bot = new Bot( bot_settings )

let fila = Promise.resolve()
const pronto = () => bot.history_loaded
  ? Promise.resolve()
  : new Promise( r => bot.eventEmitter.on( 'core.history_loaded', () => r() ) )

function registrarDecisao ( action, data, title ) {
  const item = { action, data, ts: Date.now(), id: crypto.randomUUID() }
  const tarefa = fila.then( async () => {
    await pronto()
    await Promise.race([
      bot.addToHistory( 'ui_event', 'MeuApp', item, title ),
      new Promise( r => setTimeout( r, 3000 ) ),
    ])
    return item
  })
  fila = tarefa.catch( console.error )
  return tarefa
}

function linhaDoTempo () {
  return bot.history.map( ( [ type, plugin, payload, title ], index ) => ({
    index,
    type,
    plugin,
    title: title || ( typeof payload === 'string' && type !== 'output' ? payload : null ),
    payload: type === 'output' ? JSON.parse( payload ) : payload,
  }))
}

bot.eventEmitter.on( 'core.history_loaded', () => desenhar( linhaDoTempo() ) )
bot.eventEmitter.on( 'core.history_added', () => desenhar( linhaDoTempo() ) )

document.querySelector( '#filtro-regiao' ).addEventListener( 'change', e => {
  registrarDecisao( 'filtro_aplicado', { regiao: e.target.value }, `Filtrou por ${ e.target.value }` )
})
```


## Referência rápida

| API | Descrição |
|---|---|
| `bot.history` | Array de itens `[type, plugin, payload, title]` |
| `bot.history_loaded` | `true` depois que o histórico salvo foi recuperado |
| `await bot.addToHistory(type, plugin, payload, title)` | Acrescenta um item, renova a sessão e salva |
| `bot.clearStorage()` | Apaga o histórico e dispara `core.history_cleared` |
| `bot.renewSession()` | Renova a sessão e dispara `core.history_renewed` |
| `core.history_loaded` | Histórico recuperado na inicialização |
| `core.history_added` | Um item foi acrescentado (sem dados no evento) |
| `core.history_cleared` | `bot.clearStorage()` foi chamado |
| `core.history_renewed` | A sessão foi renovada |

Veja também: [Eventos](./events.md) · [Texto (input)](./core/input/text.md) · [Bots Commands](./core/output/botscommands.md)
