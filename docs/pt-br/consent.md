# Consentimento

O Hands for Bots trabalha junto com a sua ferramenta de consentimento (o banner de cookies, ou um formulário seu). Ele não desenha o banner nem guarda a decisão: a sua ferramenta faz as duas coisas e avisa o H4B do que a pessoa permitiu. O H4B, então:

- **monta** os plugins que precisam de uma finalidade só enquanto ela está concedida. Os storages precisam de `persistence`;
- **desmonta** esses plugins quando o consentimento é retirado e **apaga o que eles guardaram**. A conversa na tela continua até a página ser fechada, ou até todas as abas serem fechadas quando o `tab-sync` a compartilha;
- **avisa o seu servidor** de quais finalidades estão concedidas (`X-H4B-Consent`), para ele saber, por exemplo, que pode colocar a conversa na fila de revisão humana;
- **anonimiza** contatos e documentos antes de a conversa ser guardada, se você incluir o plugin `redact`.

Sem a opção `consent`, nada muda: toda finalidade conta como concedida, e os plugins montam como sempre.

> Os conjuntos de regras do `@handsforbots/consent` são pontos de partida, não aconselhamento jurídico. Quem responde por privacidade onde você atua decide as finalidades, os padrões e a base legal. Pode haver storage que nem dependa de consentimento, e o `withConsent(plugin, false)` cobre esse caso.

## Ligando

```ts
import { createH4B } from '@handsforbots/core'
import { presets, regionFromMeta } from '@handsforbots/consent'
import { storageBackend } from '@handsforbots/storage-backend'
import { tabSync } from '@handsforbots/tab-sync'
import { widget } from '@handsforbots/widget'

const h4b = createH4B({
  consent: {
    rules: presets,                    // LGPD, GDPR, CCPA e um padrão opt-in
    region: regionFromMeta(),          // <meta name="h4b-region" content="BR">, escrita pelo seu servidor
    initial: lerCookieDeConsentimento(), // o que a sua ferramenta já sabe, por ex. { persistence: true }
    manage: () => ferramentaDeConsentimento.abrir(),
  },
  plugins: [storageBackend({ url: '/api/h4b/conversation' }), tabSync(), widget()],
})
await h4b.start()

// Callback da sua ferramenta, sempre que a pessoa decide ou muda de ideia:
ferramentaDeConsentimento.aoMudar((escolhas) =>
  h4b.consent.set({ persistence: escolhas.funcionais, review: escolhas.revisaoDeConversas }),
)
```

| Opção | O que faz |
|---|---|
| `rules` | Um conjunto de regras ou uma lista. Com uma lista, a `region` escolhe qual vale. Sem regras, toda finalidade começa `pending` |
| `region` | Um código (`BR`, `US-CA`) ou uma função, que pode ser assíncrona. Até ela resolver, toda finalidade sem decisão fica `pending` |
| `initial` | Decisões já conhecidas ao carregar, para o storage montar (e restaurar a conversa) já no `start()` |
| `manage` | Abre a sua ferramenta. O widget mostra então um botão *Preferências de privacidade* no lugar das próprias caixas de seleção |
| `channel` | Nome do BroadcastChannel que leva as decisões às outras abas (padrão `'default'`), ou `false` |

## Estados e finalidades

Uma finalidade é um nome que você escolhe. Os presets usam três:

| Finalidade | Controla |
|---|---|
| `persistence` | `storage-local` e `storage-backend` (o padrão deles) |
| `review` | Nada sozinha. Vai para o seu servidor em `X-H4B-Consent`, e o `redact({ when: 'review' })` pode segui-la |
| `analytics` | O que você envolver: `withConsent(observability(...), 'analytics')` |

Cada finalidade está `granted`, `denied` ou `pending`. Uma decisão (`initial`, `set`) sempre vale. Sem decisão, o padrão vem do conjunto de regras em vigor, e uma finalidade que não está nele fica `pending`. No `set()`, `true` e `false` são atalhos para `granted` e `denied`.

```ts
h4b.consent.state('persistence') // 'granted' | 'denied' | 'pending'
h4b.consent.granted('review')    // boolean
h4b.consent.purposes             // das regras em vigor e das decisões
h4b.consent.snapshot()           // { enabled, region, rules: 'lgpd', states: { … } }
await h4b.consent.set({ review: false })   // resolve depois de montar ou desmontar os plugins
await h4b.consent.setRegion('DE')
h4b.consent.subscribe(render)    // ou h4b.on('consent.changed', …)
```

## O que acontece, passo a passo

| Momento | Efeito |
|---|---|
| `pending` (ninguém decidiu ainda) | O storage não é montado, então nada é gravado: nem cookie da chave, nem `localStorage`, nem requisição ao seu servidor. A conversa vive na memória |
| Concedido | O storage monta. Se nada foi digitado ainda, a conversa guardada é restaurada. Senão, a conversa da tela é mantida e salva no lugar da guardada |
| Retirado (`denied`, ou de volta a `pending`) | O storage desmonta e tudo o que ele guardava é apagado: a conversa em todas as retenções, o cookie da chave (ou `DELETE` no `backendKey`), a escolha de retenção e o id da conversa (depois de um `DELETE` no `storage-backend`). A conversa na tela continua |
| `denied` numa visita seguinte | Sobras de uma visita anterior são apagadas do mesmo jeito |
| Outra aba decide | A decisão chega pelo BroadcastChannel e os mesmos passos rodam lá |
| Página fechada | O que estava só na memória some. Com o `tab-sync`, a conversa continua enquanto houver alguma aba do site aberta |

`eraseOnRevoke: false` na regra de uma finalidade mantém o que foi guardado quando o consentimento é retirado (o storage desmonta mesmo assim). Use só quando outra base legal cobrir a guarda dos dados.

## Conjuntos de regras: um por legislação, declarativos

Um conjunto de regras é JSON puro, então pode ficar num arquivo `.json` ou `.yml` que o seu jurídico edita:

```yaml
# consent/rules.yml
- id: lgpd
  label: { en: LGPD (Brazil), pt-BR: LGPD (Brasil) }
  regions: [BR]
  purposes:
    persistence:
      default: pending           # opt-in
      label: { en: Keep this conversation, pt-BR: Guardar esta conversa }
    review:
      default: pending
      label: { en: Human review, pt-BR: Revisão por pessoas }
      description: { pt-BR: Guardada com contatos e documentos anonimizados, revisada pela nossa equipe. }
- id: ccpa
  regions: [US-CA]
  purposes:
    persistence: { default: granted }   # opt-out
    review: { default: granted }
- id: demais
  regions: ['*']
  purposes:
    persistence: { default: pending }
    review: { default: pending }
```

```ts
import YAML from 'yaml'
import { loadConsentRules, regionFromUrl } from '@handsforbots/consent'

createH4B({
  consent: {
    rules: await loadConsentRules('/consent/rules.yml', { parse: YAML.parse }),
    region: regionFromUrl('/api/geo'), // responde "BR", ou { "region": "BR" }
  },
})
```

| Campo | Significado |
|---|---|
| `id` | Aparece em `snapshot().rules` e no `consent.changed` |
| `regions` | Códigos ISO 3166 de país (`BR`) ou de subdivisão (`US-CA`), ou `*`. Um país também vale para as suas subdivisões, e vence o mais específico. Ausente equivale a `*` |
| `purposes.<nome>.default` | `pending` (opt-in), `granted` (opt-out) ou `denied` |
| `purposes.<nome>.eraseOnRevoke` | Padrão `true` |
| `label`, `description` | Um texto, ou um por idioma. O widget escolhe o do seu `language` |

O `parseConsentRules(dados)` valida um conjunto e diz qual campo está errado. O `createH4B` valida os que recebe. Os presets (`lgpd`, `gdpr`, `ccpa`, `optIn`, todos juntos em `presets`) também estão em `@handsforbots/consent/rules/*.json`, para você copiar e editar.

### Seguindo a origem do acesso

O navegador não consegue dizer com segurança de onde vem a visita. O seu servidor ou a CDN conseguem:

- **Meta tag:** escreva o cabeçalho de geolocalização da CDN (`CF-IPCountry`, `CloudFront-Viewer-Country`, `X-Vercel-IP-Country`…) na página como `<meta name="h4b-region" content="BR">` e use `regionFromMeta()`.
- **Endpoint:** o `regionFromUrl('/api/geo')` pergunta a um endpoint seu. Uma falha conta como região desconhecida, então só valem os conjuntos com `*`.
- **Mudança de região:** o `h4b.consent.setRegion(codigo)` troca o conjunto depois, por exemplo quando se descobre o país de quem fez login. As decisões já tomadas continuam valendo.

Sem um conjunto que combine (e sem `*`), toda finalidade fica `pending`.

## Condicionando outros plugins

```ts
import { withConsent } from '@handsforbots/core'

plugins: [
  withConsent(observability({ exporters }), 'analytics'), // só monta com analytics
  withConsent(storageLocal({ retention: 'tab' }), false), // nunca condicionado (outra base legal)
]
```

Quem escreve plugins define um padrão com `definePlugin({ consent: 'finalidade', … })` e faz a limpeza com `ctx.onRevoke(fn)`, que roda depois de o plugin ser desmontado porque o consentimento foi retirado (nunca no `stop()`). Quando o plugin fornecia `storage`, o kernel já terá chamado o `clear()`. O `h4b.use(plugin)` segue o consentimento do mesmo jeito.

## Revisão humana com anonimização

A segunda ferramenta, o consentimento para guardar conversas que pessoas vão revisar, corresponde à finalidade `review`:

```ts
import { redact } from '@handsforbots/consent'

createH4B({
  consent: { rules: presets, region },
  plugins: [
    storageBackend({ url: '/api/h4b/conversation' }),
    redact({ when: 'review' }), // cópia guardada anonimizada enquanto review estiver concedido
  ],
})
```

- Toda requisição do `storage-backend` leva `X-H4B-Consent: persistence,review` (as finalidades concedidas). Quando a lista muda, a conversa é salva de novo na hora, para o servidor ficar sabendo.
- O `redact` roda no `storage.before`: ele muda **o que é guardado**, nunca o que está na tela. Troca e-mails, telefones, CPF, CNPJ e números de cartão por `[email]`, `[phone]`…, e transforma fotos e arquivos num marcador `redacted_media` (só tipo e nome). Acrescente padrões seus com `custom: { matricula: /AB-\d{4}/g }`. Use `hooks: ['storage.before', 'request.before']` para escondê-los também do assistente.
- A detecção no navegador é **por melhor esforço**, e um script na página consegue ler a conversa. Anonimize de novo no servidor antes de qualquer pessoa revisar. Uma boa arquitetura guarda a cópia da própria pessoa sob `persistence` e monta uma cópia anonimizada separada para quem revisa, só enquanto `X-H4B-Consent` incluir `review`:

```ts
// Express
app.put('/api/h4b/conversation', async (req, res) => {
  const id = req.get('x-h4b-conversation')!
  const finalidades = (req.get('x-h4b-consent') ?? '').split(',')
  await conversas.salvar(id, req.body, ttlDe(req.get('x-h4b-retention')))
  if (finalidades.includes('review')) await filaDeRevisao.gravar(id, anonimizar(req.body)) // o seu anonimizador
  else await filaDeRevisao.remover(id)
  res.sendStatus(204)
})
app.delete('/api/h4b/conversation', async (req, res) => {
  const id = req.get('x-h4b-conversation')!
  await conversas.apagar(id)
  await filaDeRevisao.remover(id) // retirar persistence apaga também a cópia de revisão
  res.sendStatus(204)
})
```

`redactText`, `redactMessages` e `redactor(opções)` também são exportados, para os seus interceptadores ou para o servidor.

## Widget

Com `consent` ligado, o botão 🔒 aparece mesmo antes de algo ser guardado. O painel mostra onde a conversa fica ("só nesta página" enquanto o storage não está montado) e uma linha por finalidade: uma caixa de seleção, ou o estado e um botão *Preferências de privacidade* quando há `manage`. O `widget({ showPrivacy: false })` o esconde. Interfaces próprias usam o `h4b.consent` direto.

## Detalhes de cada storage

- **`storage-local`:** antes do consentimento, nem o cookie da chave é gravado. Ao revogar, o `forget()` apaga a conversa em todas as retenções, a escolha de retenção e a chave: o cookie expira na hora, e o `backendKey` envia `DELETE url`.
- **`storage-backend`:** envia `X-H4B-Consent` quando o consentimento está ligado. Ao revogar, envia `DELETE` da conversa atual e esquece o id. Nunca cria um id só para apagar.
- **`storage.before`** (hook do core) roda antes de todo salvamento, inclusive nas trocas de retenção. Devolva um snapshot novo e nunca altere o que recebeu. Devolva `null` para pular aquele salvamento. O `h4b.persist()` salva na hora.

Veja também [Persistência, memória e privacidade](./persistence.md), [Segurança](./security.md) e o [ADR 0010](../adr/0010-consentimento.md).
