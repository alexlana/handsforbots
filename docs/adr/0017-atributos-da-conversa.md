# 0017 — Atributos da conversa, exposições e contadores de experimento

**Contexto.** O site do polvo (alexlana) fez à mão um teste A/B das frases de boas-vindas. Um `telemetry.tag` próprio guardava `greeting.kind` e `greeting.index`, um `fetch` embrulhado punha os dois nos spans, um span `greeting.shown` contava quem viu, e uma recarga marcava a conversa de novo a partir do `sessionStorage`. O backend recebia só o `traceparent`, e os traces duram 14 dias e podem ser amostrados. Quase tudo isso é genérico: em qual variante a conversa está, quem a viu, quem conversou, e o backend saber disso. Só a análise e o significado das frases são do app.

Há também um problema de consentimento. O cumprimento é sorteado quando a página abre, muitas vezes antes de o visitante responder ao aviso. A `observability` só monta com `analytics` (`withConsent`), então uma exposição emitida antes disso se perdia.

**Decisão.**

- **Atributos no kernel, presos à conversa.** `h4b.setConversationAttributes(changes)` junta os novos aos que existem, e `null` remove uma chave. Ficam em `h4b.conversation.attributes` e em `SessionSnapshot.attributes`, como o `memory`: são salvos, voltam numa restauração (e pelo `tab-sync`) e somem no `reset()`. O evento `conversation.attributes` tem `reason` igual a `set`, `restored` ou `reset`. Ficam no kernel e não no plugin porque o sorteio acontece antes de o plugin montar. Guardar com a conversa não manda nada para fora; quem envia é só a `observability`.
- **Só códigos.** Até 16 atributos. Chave em minúsculas (`a-z`, dígitos, `_ . -`, até 64 caracteres). Valor número finito, booleano ou string `[A-Za-z0-9_.:-]{1,64}`, sem espaço, para uma frase não caber. O que não serve é descartado com `error` (`source: 'conversation.attributes'`), e atributos vindos do storage passam pela mesma limpeza.
- **Exposições em memória.** `h4b.expose(experiment, attributes?)` registra que alguém viu uma variante e emite `experiment.exposed`. As exposições ficam em `h4b.exposures` para a conversa na tela: nunca são guardadas, e `reset()` ou uma restauração as apagam. Ao montar, a `observability` registra as que ainda não registrou (`late: true`). Por isso o `analytics` concedido depois do sorteio, na mesma página, não perde a exposição. Uma recarga não conta de novo, porque a conversa restaurada não traz exposições.
- **`pickVariant` no core.** O sorteio que evita a última opção sai do widget, para servir a outros testes (lembretes por inatividade, sugestões). `pickGreeting` aceita opções `{ text, attributes }` e devolve `attributes`. O widget põe os atributos na conversa e registra a exposição; quem chama `pickGreeting` por conta própria decide o que fazer.
- **Índice do último cumprimento.** Com `consent`, ele só vai para o `localStorage` depois que `persistence` é concedido; antes disso fica em memória.
- **Observabilidade.** A `semantic-event-observability` ganha:
  - `setAttributes` / `getAttributes`: os atributos vão em todo evento e span;
  - um cabeçalho W3C `baggage` em `getTraceHeaders()`, juntado a um `baggage` que o propagador do OTel já tenha posto;
  - `recordCounter`: um Counter do OTel criado no primeiro uso, sem amostragem nem limite de taxa.

  A `observability` copia os atributos da conversa e conta duas coisas: `h4b_experiment_exposed_total` e `h4b_conversation_engaged_total` (o primeiro turno do visitante, sem leitura de sensor nem lembrete por inatividade).
- **Contadores além de spans.** Os traces são amostrados e expiram. Os contadores somam pelo tempo que o banco de métricas os guardar, e "viu e não conversou" sai de `exposed − engaged` por variante. Os rótulos são os atributos, então a cardinalidade fica limitada pela validação e pelo cuidado de quem integra.
- **Servidor.** `@handsforbots/observability/server` tem `readConversationAttributes(headers, { allow, maxLength })`, que mantém só as chaves permitidas e valores em forma de código, convertendo o tipo quando pedido. Não depende do core nem do navegador.

Fontes em [Referências → Experimentos e atributos da conversa](../en-us/references.md#experiments-and-conversation-attributes).

**Consequências.**

- Um teste A/B no app passa a ser: opções com atributos, mais a análise. O resto (spans, cabeçalho, contadores, exposição tardia, servidor) é da H4B.
- `SessionSnapshot` ganha um campo opcional, e storages que gravam o snapshot inteiro não precisam mudar.
- Com o `storageBackend`, os atributos vão ao servidor dentro do snapshot, sob `persistence`. São códigos, e o texto do cumprimento já vai nas mensagens.
- Quem nunca concede `analytics` não é contado: a exposição fica só na memória e some com a aba. Contar o total de visitas sem consentimento, de forma agregada e anônima, fica para outra decisão.
- Testes em pontos da conversa (inatividade, depois de N turnos, depois de uma ação) usam o mesmo mecanismo. Uma variante no `idle` do `gui()` fica para depois.
