# Persistência, memória e privacidade

Três perguntas independentes decidem o que acontece com uma conversa:

| Pergunta | Quem responde | Padrão |
|---|---|---|
| **Quanto é enviado** ao assistente a cada turno? | `memory` (montado por padrão) | Os últimos 20 turnos; os anteriores, como resumo |
| **Quanto fica guardado** no histórico? | `memory` | Os últimos 100 turnos |
| **Onde fica guardado, e por quanto tempo?** | `storage-local` ou `storage-backend` | Em lugar nenhum: sem um plugin de storage, a conversa vive só na página |

As abas são uma quarta escolha, separada: o `tab-sync` decide se elas compartilham a conversa.

```ts
import { createH4B } from '@handsforbots/core'
import { storageLocal } from '@handsforbots/storage-local'
import { tabSync } from '@handsforbots/tab-sync'

const h4b = createH4B({
  memory: { send: 20, keep: 100 }, // os padrões; false desliga
  plugins: [storageLocal(), tabSync()],
})
```

## Turnos

Um turno é um job do kernel: uma mensagem do usuário com tudo o que o assistente e as ações acrescentaram em resposta, uma chamada de `runAction` ou um `push`. Cada mensagem registra o `turnId` que a criou, então uma chamada de ação e o seu resultado ficam sempre no mesmo turno. Mensagens salvas antes de o `turnId` existir são agrupadas por mensagem do usuário.

## Memória: o que é enviado e o que fica guardado

O `@handsforbots/memory` é um plugin que o `createH4B` monta para você. Ele faz três coisas:

- **Janela de envio (`send`).** Antes de cada requisição (`request.before`), mantém só os últimos `send` turnos, contando o atual. `'all'` envia tudo; `'none'` envia só o turno atual, para backends que guardam a conversa por conta própria (Rasa, um agente com memória de thread, ou o `storage-backend` lido pelo seu agente). O histórico na tela não é afetado.
- **Compactação (`compact`).** Os turnos que saem da janela viram um resumo, enviado como o sinal de contexto `memory.summary` (todos os transportes repassam sinais de contexto). O resumo é atualizado antes de cada requisição, então nenhum turno é simplesmente descartado com a compactação ligada.
  - `'local'` (padrão): sem LLM. Uma linha por mensagem, ações com o resultado (`Action filter_orders({"status":"late"})` / `→ filter_orders: ok`), textos longos cortados, UI rica e mídia de fora. Gratuito e previsível, mas grosseiro.
  - Uma função `Summarizer`, como `httpSummarizer({ url })`, para o seu backend resumir com um LLM. Ela recebe o resumo anterior e os turnos que estão saindo da janela. Se falhar, usa-se o resumo local e é emitido um `error` com origem `memory`.
  - `false`: os turnos antigos simplesmente não são enviados.
  - `maxSummaryChars` (4000) limita o tamanho do resumo; as linhas mais antigas saem primeiro.
- **Retenção por turnos (`keep`).** Depois de cada job, os turnos além de `keep` saem do histórico e, portanto, do storage. Com a compactação ligada, só saem turnos que já estão no resumo. `keep` nunca é menor que `send`; `'all'` guarda tudo.

O resumo faz parte do snapshot da conversa (`SessionSnapshot.memory`), então é guardado e restaurado junto com ela. `h4b.reset()` o esquece. O serviço `memory` expõe `options`, `summary`, `view(request)` (o que seria enviado) e `maintain()`; o evento `memory.changed` avisa de resumos novos e mensagens removidas.

```ts
import { httpSummarizer, memory } from '@handsforbots/memory'

createH4B({ memory: { send: 10, keep: 50, compact: httpSummarizer({ url: '/api/h4b/summary' }) } })
createH4B({ memory: { send: 'none' } }) // o backend lembra
createH4B({ memory: false })            // envia e guarda tudo
createH4B({ plugins: [memory({ send: 30 })] }) // a sua instância substitui a padrão
```

O `httpSummarizer` envia `{ previous, messages }` (as mensagens H4B dos turnos que saem da janela) e espera `{ summary }`:

```ts
// Express, com a chave do provedor no servidor
app.post('/api/h4b/summary', async (req, res) => {
  const { previous, messages } = req.body
  const summary = await llm(`Atualize este resumo de conversa.\nResumo até aqui: ${previous ?? '(nenhum)'}\nNovos turnos: ${JSON.stringify(messages)}`)
  res.json({ summary })
})
```

## Onde a conversa fica guardada

### No navegador: `storage-local`

Criptografada por padrão (AES-GCM, Web Crypto). A chave fica **fora** do dado guardado e expira, então depois do prazo não sobra nada legível, mesmo que a pessoa nunca volte ao site. Essa é a proteção; a criptografia é o jeito de garanti-la.

| Fonte da chave | Quem expira a chave | Observações |
|---|---|---|
| `cookieKey({ ttlMinutes: 30 })` (padrão) | O navegador (`Max-Age`, renovado a cada carregamento e gravação) | `SameSite=Strict`, `Secure` em https, `path` configurável. Uns 60 bytes vão junto nas requisições a esse caminho |
| `backendKey({ url })` | O seu servidor | A chave é buscada a cada carregamento e gravação e fica só em memória |

```ts
storageLocal()                                                   // chave em cookie, 30 min sem uso
storageLocal({ keySource: cookieKey({ ttlMinutes: 0 }) })        // até fechar o navegador
storageLocal({ keySource: backendKey({ url: '/api/h4b/key' }) }) // chave no servidor
storageLocal({ encrypt: false })                                 // JSON legível (só para demos sem dados sensíveis)
```

Protocolo do `backendKey`: `GET url` → `200 { "key": "<base64url, 32 bytes aleatórios>" }` (e renova a validade) ou `404`; `POST url` → `200` com a chave existente ou uma nova. Identifique o usuário pelo seu próprio cookie de sessão (enviado com `credentials: 'same-origin'`).

```ts
// Express: uma chave por sessão, que expira após 30 minutos sem uso
const keys = new Map<string, { key: string; expires: number }>()
const TTL = 30 * 60_000
app.get('/api/h4b/key', (req, res) => {
  const entry = keys.get(req.session.id)
  if (!entry || entry.expires < Date.now()) return res.sendStatus(404)
  entry.expires = Date.now() + TTL
  res.json({ key: entry.key })
})
app.post('/api/h4b/key', (req, res) => {
  let entry = keys.get(req.session.id)
  if (!entry || entry.expires < Date.now()) entry = { key: crypto.randomBytes(32).toString('base64url'), expires: 0 }
  entry.expires = Date.now() + TTL
  keys.set(req.session.id, entry)
  res.json({ key: entry.key })
})
```

Sem chave, o dado guardado não pode ser lido: ele é apagado no próximo carregamento ou pela varredura que roda a cada minuto. Se não houver fonte de chave disponível (sem Web Crypto, cookies bloqueados), nada é salvo e o `save()` reporta um `error` com origem `storage`. Blobs (fotos, áudio) sempre viram marcadores `omitted_media`.

### No seu servidor: `storage-backend`

```ts
import { storageBackend } from '@handsforbots/storage-backend'

createH4B({ plugins: [storageBackend({ url: '/api/h4b/conversation' })] })
```

`GET url` carrega (`200` com o snapshot, ou `204`/`404`), `PUT url` salva, `DELETE url` apaga. Toda requisição leva `X-H4B-Conversation` (um id aleatório guardado no localStorage, ou no sessionStorage com a retenção `'tab'`) e `X-H4B-Retention` (`server`, `tab` ou o TTL em minutos). O seu servidor aplica a retenção. Quem tem o id consegue ler a conversa: com usuários logados, vincule-o à sessão deles.

```ts
// Express, em memória (use o seu banco)
const conversations = new Map<string, { snapshot: unknown; expires: number }>()
const ttlOf = (header?: string) => (Number(header) > 0 ? Number(header) : 24 * 60) * 60_000 // 'server' e 'tab': a sua política
app.get('/api/h4b/conversation', (req, res) => {
  const entry = conversations.get(req.get('x-h4b-conversation')!)
  if (!entry || entry.expires < Date.now()) return res.sendStatus(404)
  res.json(entry.snapshot)
})
app.put('/api/h4b/conversation', (req, res) => {
  conversations.set(req.get('x-h4b-conversation')!, { snapshot: req.body, expires: Date.now() + ttlOf(req.get('x-h4b-retention')) })
  res.sendStatus(204)
})
app.delete('/api/h4b/conversation', (req, res) => {
  conversations.delete(req.get('x-h4b-conversation')!)
  res.sendStatus(204)
})
```

## Por quanto tempo: retenção

Os dois storages usam o tipo `Retention` do `core`:

| Retenção | `storage-local` | `storage-backend` |
|---|---|---|
| `'key'` | Até a chave expirar (padrão) | — |
| `'server'` | — | Como o seu servidor decidir (padrão) |
| `{ ttlMinutes }` | Também apaga após esse tempo sem atividade | Enviado ao servidor |
| `'tab'` | sessionStorage: some ao fechar a aba | O id fica no sessionStorage: uma aba fechada não o alcança mais; o TTL do servidor apaga |

O desenvolvedor define o padrão com `retention` e o que quem usa o site pode escolher com `userChoices`:

```ts
storageLocal({ retention: 'key', userChoices: ['tab', { ttlMinutes: 5 }] })
```

Os dois storages fornecem o serviço `retention` (`current`, `choices`, `location`, `encrypted`, `keyTtlMinutes`, `set()`, `subscribe()`). O `set()` move o que está guardado e lembra a escolha neste navegador, para todas as abas. O widget mostra um botão 🔒 com onde a conversa fica, as escolhas e *Apagar a conversa agora* (`h4b.reset()`); `widget({ showPrivacy: false })` o esconde, e a sua própria interface pode usar o serviço direto.

## Abas e janelas: `tab-sync`

| `mode` | Comportamento |
|---|---|
| `sync` (padrão) | Uma conversa compartilhada por todas as abas; históricos da mesma conversa são mesclados por id de mensagem, uma conversa diferente (um reset) substitui |
| `notify` | Cada aba tem a sua conversa; as outras recebem `tabs.activity` (ações, turnos do assistente, resets) e o sinal de contexto `tab-sync.activity` com as últimas 10, para o assistente saber o que aconteceu nas outras (`context: false` deixa só o evento) |
| `off` | Isoladas: nada é transmitido |

Sem o `tab-sync`, as abas ainda compartilham o mesmo storage do navegador: cada uma o carrega ao abrir e o sobrescreve ao salvar. Para `notify` ou `off`, use a retenção `'tab'`, para cada aba ter a sua cópia.

## Receitas

| Necessidade | Configuração |
|---|---|
| Computadores compartilhados ou públicos | `storageLocal({ retention: 'tab' })`, ou `cookieKey({ ttlMinutes: 0 })` |
| Quem usa decide | `userChoices` + o painel 🔒 do widget |
| Nada no navegador | `storageBackend({ url })` |
| Linhas do tempo longas de decisões | Aumente `keep` (ou `'all'`) e mantenha o backend como fonte da verdade |
| Menos tokens por turno | Diminua `send`; `compact: httpSummarizer(...)` para resumos melhores |
| Agente com memória própria | `memory: { send: 'none' }` |

## Notas de segurança

- A criptografia aqui **limita o tempo** em que a conversa fica legível no navegador. Ela **não** protege contra XSS: um script injetado na página consegue ler o cookie da chave, chamar o `backendKey` com a sessão do usuário e ler `h4b.messages` em memória. Uma revisão de XSS de ponta a ponta, incluindo esta arquitetura de chave, é item P0 do [ROADMAP](../../ROADMAP.md).
- Não coloque segredos em argumentos ou resultados de ações: eles são histórico, enviados ao backend e guardados. Oculte dados pessoais com um interceptador `request.before`.
- Veja também [Segurança](./security.md) e as decisões nos [ADR 0008](../adr/0008-persistencia-e-abas.md) e [ADR 0009](../adr/0009-memoria.md).
