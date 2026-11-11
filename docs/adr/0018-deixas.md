# 0018 — Deixas: categorias de apresentação com vocabulário fechado, regras ligadas ao conteúdo e política de repetição

**Contexto.** O site do polvo (alexlana) quer que o personagem mude de atitude conforme a conversa. Uma lista de tons (`neutro`, `curioso`, `contente`, `empolgado`, `pensativo`, `confuso`, `sem-graça`, `envergonhado`, `brincalhão`, `sério`, `ofendido`) decide pose, animação e fala. O mesmo tom repetido em sequência intensifica a atitude. Um valor inválido vira `neutro`. O `ofendido` só pode avisar uma vez.

Humor é só um caso de uso. O mesmo formato aparece em outros lugares: uma resposta pede uma reação da página que não é texto, o valor sai de uma lista conhecida, e o front-end decide o que fazer com ele. Alguns exemplos:

- o cenário que muda conforme o assunto;
- a urgência de um atendimento (`normal`, `atencao`, `urgente`), que destaca a conversa;
- o grau de confiança da resposta, que mostra ou esconde um aviso;
- o modo da conversa (`livre`, `formal`, `restrito`), que desliga brincadeiras na interface;
- a etapa de um fluxo guiado, que muda a cor ou o progresso.

Hoje dá para fazer isso à mão com um `ui.effect` ou `custom` vindo do backend, ou com uma ação registrada pelo app. Mas cada app resolveria as mesmas coisas sozinho: validar contra a lista, contar repetições, limitar um valor que não pode se repetir, guardar o valor na mensagem para que uma restauração ou outra aba mostre o mesmo estado, decidir o que vale quando o backend não manda nada, e ligar um valor a um conteúdo (as fontes de uma taxonomia, uma ação, um erro). O significado de cada valor e o que a página faz com ele são do app. O resto é genérico.

O nome vem do teatro. A **deixa** é o sinal combinado que diz ao ator ou à técnica quando entrar, mudar a luz ou trocar o cenário. Ela não é o texto da cena, só a marca de que algo muda. "Sinal" já é o nome da entrada do kernel ([ADR 0002](./0002-sinal-turno-estimulo.md)), e "humor" ou "expressão" prenderiam o pacote a personagens.

Os atributos da conversa ([ADR 0017](./0017-atributos-da-conversa.md)) não servem para isso. Eles marcam a conversa inteira para experimentos, vão em todo span e no `baggage`, e viram rótulos de contador. Uma deixa muda a cada mensagem e encheria esses rótulos de ruído.

**Decisão.**

- **Pacote `@handsforbots/cues`, sem mudar o core.** É um plugin `cues({ channels, rules?, classify?, report? })` que usa só o que o kernel já tem: estímulos, ações, partes `data`, eventos, interceptadores e sinais de contexto. Nada nele fala de personagem: o tom de humor é um canal como outro qualquer.
- **Canais com vocabulário fechado.** Um canal é uma dimensão independente das outras (`tone`, `scene`, `urgency`, `mode`), com nome em minúsculas, dígitos e `-` (`^[a-z][a-z0-9-]{0,31}$`), porque vira nome de atributo HTML. Cada um declara:
  - `values`: os valores aceitos, em forma de código, com a mesma regra dos atributos (`[A-Za-z0-9_.:-]{1,64}`). `sem-graça` vira `sem-graca`, e o rótulo exibido é do app;
  - `default`: o valor de quando ninguém decidiu nada;
  - `persist`: com `'message'` (padrão), uma mensagem sem valor volta ao `default`; com `'sticky'`, mantém o anterior. Tom costuma ser `message`, e cenário ou modo costumam ser `sticky`;
  - `repeat` (opcional): a política de repetição de cada valor (veja abaixo).

  Um valor fora da lista vira o `default` e emite `error` com `source: 'cues'`. Um canal desconhecido é descartado com o mesmo `error`.
- **Três entradas, todas pela mesma validação:**
  1. **Estímulo do backend.** `ui.effect` com `name: 'cues'` e `value: { tone: 'curioso', scene: { value: 'oficina', level: 2 } }`. Funciona com os transportes que já entregam `ui.effect`, sem contrato novo. Com `messageId` no `value`, vale para aquela mensagem, e nomear uma mensagem já guardada a decide de novo, mantendo os outros canais. Sem ele, vale para a próxima resposta do turno que tenha texto. Respostas sem texto (só chamadas de ferramenta) não recebem deixas.
  2. **Ação `set_cues`.** O plugin a registra com um JSON Schema gerado a partir dos canais (um `enum` por canal), `confirm: 'never'` e origens `assistant` e `agent`. Serve para backends que só falam por tool calling. O resultado devolve o estado aplicado, inclusive o que a política de repetição trocou, para o modelo saber o que valeu.
  3. **Regras no cliente.** Uma regra é `{ when, set, priority? }`. O `when` vê a mensagem do assistente e o turno: as partes `source` (url, `trail`, título), as ações chamadas, os eventos (`error`, `turn.interrupted`, ação negada) e o tipo de sinal que abriu o turno. Pode ser uma função ou uma forma declarativa (`{ source: { urlPrefix, trail } }`, `{ action: 'nome' }`, `{ event: 'error' }`). É assim que um valor se liga a taxonomias e elementos. As partes `source` não têm campo de taxonomia, então o app pode passar `classify(source) → string[]`, e as regras usam `{ taxonomy: 'projetos' }`.
- **Precedência.** Para cada canal em cada mensagem: o backend (estímulo ou ação) vence uma regra, e uma regra vence o `default` ou o valor mantido pelo `sticky`. Entre regras, ganha a de maior `priority`; empatadas, a última declarada. A política de repetição vem depois de tudo, sobre o valor escolhido. As regras rodam no fim da mensagem (`message.end`), porque as fontes e as ações só estão completas ali. Um valor do backend aparece assim que chega, com `pending: true`, e é guardado quando a mensagem termina.
- **Contagem.** Por canal, o plugin guarda `{ value, previous, streak, count, level, messageId, from }`:
  - `streak`: mensagens seguidas do assistente com o mesmo valor, começando em 1;
  - `count`: quantas mensagens tiveram esse valor na conversa;
  - `level`: o nível da política de repetição (veja abaixo), 1 sem política;
  - `from`: `'backend'`, `'rule'`, `'default'`, `'sticky'` ou `'repeat'`.

  A contagem vale para qualquer valor de qualquer canal, não só para um tom.
- **Política de repetição, por valor.** `repeat` diz o que acontece quando um valor se repete. É declarativa e igual para todos os canais:
  - `levels: [2, 4]` faz o nível subir quando o `streak` (ou o `count`, com `by: 'count'`) alcança cada limite. Com `[2, 4]`, o primeiro `confuso` é nível 1, o segundo seguido é 2 e o quarto é 3. O backend pode mandar o nível explicitamente, preso entre 1 e o máximo;
  - `max: 1` com `by: 'count'` (ou `'streak'`) limita quantas vezes o valor vale. Passado o limite, ele é trocado por `then` (um valor do mesmo canal; sem `then`, o `default`), com `from: 'repeat'`. O `ofendido` que avisa uma vez é `{ ofendido: { max: 1, by: 'count', then: 'serio' } }`;
  - cada vez que um nível sobe ou um limite troca o valor, sai o evento `cue.repeat` `{ channel, value, level, streak, count, replacedBy? }`.

  Não há decaimento por tempo nesta versão.
- **Onde fica a fronteira.** A H4B conta, aplica a política ao que a página mostra e conta ao backend. Ela não decide o que o assistente diz. Se o `ofendido` passou do limite, a página mostra `serio`. Mas o texto da resposta continua sendo do backend, e o "aviso" em palavras é dele. Para o backend poder seguir a mesma política, há duas saídas: com `report: true`, o plugin põe um sinal de contexto `cues.state` (`{ tone: { value, streak, count, level } }`) em cada requisição; e a ação `set_cues` devolve a troca. Uma política só de interface, sem o backend saber, deixaria a cara e a fala em desacordo. Por isso o `report` é recomendado sempre que houver `max`.
- **Guardado na mensagem.** O valor resolvido vai na própria mensagem do assistente como parte `{ type: 'data', name: 'cues', value: { tone: { value: 'serio', level: 1, from: 'repeat' } } }`. Por isso a persistência, a restauração e o `tab-sync` levam o estado junto. O plugin o reconstrói relendo o histórico, com `streak`, `count` e os limites já gastos. As regras e a política não rodam de novo sobre mensagens antigas, então mudar uma regra não reescreve o passado. Uma mensagem interrompida e removida leva o valor dela embora. `reset()` volta tudo ao `default` e zera as contagens.
- **Saída para o front-end:**
  - o evento `cue.changed` `{ channel, value, previous, streak, count, level, messageId, from }`, emitido só quando algo muda, e `cue.repeat`;
  - o serviço `h4b.get('cues')` com `getState()` e `subscribe()`, no formato que o `useStore` dos bindings de React e Vue já lê. Os bindings não ganham um hook próprio, para não dependerem do pacote;
  - no widget, `data-cue-<canal>` e `data-cue-<canal>-level` no `<h4b-chat>`, como os outros `data-` dele, para reagir só com CSS. O widget lê o serviço pelo formato, sem importar o plugin, e tira os atributos quando o serviço some.

  A H4B não desenha nada: personagem, animação, cenário e destaque são do app.
- **Segurança.** Só valores da lista saem do plugin. Assim, um backend comprometido não consegue injetar classes, nomes de arquivo ou HTML pelos atributos `data-` ou pelos componentes do app.
- **Sincronia com a voz (2026-11-11).** Com `sync: 'speech'` (padrão), as deixas de uma resposta que vai ser falada aparecem quando o primeiro trecho dela começa a tocar, e não quando ela chega. Não há atraso fixo: o tempo até a fala muda com o download do modelo, a síntese e o que ainda está tocando. Também não depende do provedor dizer onde está: o próprio `voice` divide a resposta em frases e passa a contar isso.
  - O `voice` emite `voice.track` (`{ messageId, speak }`) quando o texto de uma resposta começa a chegar, e põe `messageId`, `from` e `to` (posições no texto) em cada `voice.speech` dos trechos da resposta. Um trecho que nunca foi falado termina como `skip` (`no-provider` ou `cancelled`), para quem espera não ficar preso. O serviço ganha `willSpeakReplies()`.
  - As deixas seguram a resposta marcada com `speak: true` e a soltam no primeiro `voice.speech` com o `messageId` dela, seja qual for a fase. `turn.interrupted` e a saída do serviço `voice` soltam tudo. Um valor do backend que chega antes do texto fica seguro se `willSpeakReplies()` diz que a resposta vai ser falada.
  - Até soltar, o `getState()` e o widget mostram o estado anterior. O `report` e o resultado do `set_cues` já levam o que foi decidido, porque o backend precisa da verdade, não do que está na tela.
  - `sync: 'arrival'` mostra tudo na chegada, como antes. Respostas que não são faladas mostram na chegada nos dois modos.
  - A precisão é por frase, que é o que o `voice` fala de cada vez. Por palavra dependeria de marcas de tempo do provedor (`onboundary` no Web Speech, alinhamento em alguns TTS na nuvem; Piper e Kokoro não dão) ou de uma estimativa pela duração do áudio. Fica para quando houver um uso, como sincronia labial.
- **Leitor no servidor (2026-11-11).** `@handsforbots/cues/server` tem `readCuesState(origem, permitidos, opções?)`, como o `readConversationAttributes` da [ADR 0017](./0017-atributos-da-conversa.md): sem core nem navegador, aceita o `context` do AG-UI (onde o sinal chega como `cues.state: {…}`), o objeto de contexto do transporte HTTP, sinais ou o próprio valor, e devolve só canais e valores permitidos, com `streak`, `count` e `level` inteiros dentro da faixa. O formato com que os transportes mandam o contexto não mudou, porque outros backends podem depender dele; o leitor é que entende os formatos. O estado vem do navegador e pode ser forjado: serve para escolher as palavras, e uma regra que precisa valer pede uma contagem guardada pelo backend.
- **Observabilidade.** A `observability` grava `cue.changed` e `cue.repeat` como eventos (são só códigos). Deixas não viram atributos da conversa nem rótulos de contador.

**Consequências.**

- Qualquer reação da página guiada pela conversa passa a ser: a lista de valores, as regras do app e o que a página faz com cada valor. Validação, precedência, contagem, política de repetição, persistência e entrega ao front-end ficam com a H4B.
- O backend tem dois jeitos de mandar uma deixa, por estímulo ou por ação, e pode não mandar nada, deixando as regras decidirem.
- O histórico ganha uma parte `data` a mais por mensagem. Ela é para a página (restauração, `tab-sync`): os transportes AG-UI e HTTP só mandam de volta o texto das respostas do assistente, então ela não volta ao modelo. O caminho até o backend é o `report`.
- Um componente inteiro trocado continua sendo `ui.render` com `slot`. As deixas são para valores de uma lista, não para conteúdo.
- **Em aberto:**
  - se a política de repetição deve mesmo ficar na H4B. Ela entra porque a contagem já está aqui e porque a interface precisa aplicá-la sem esperar o backend. Mas ela duplica o que o backend decide sobre a fala. Se os usos mostrarem que só a contagem e o `report` bastam, o `max`/`then` sai e fica só o `levels`;
  - ligar um valor a um preset de `voice-effects` ou de prosódia;
  - deixas por trecho da resposta, que exigiriam posições como as das citações ([ADR 0014](./0014-fontes-e-citacoes.md)); o `from`/`to` do `voice.speech` já diz em que frase a voz está;
  - o decaimento do nível por tempo;
  - um campo de taxonomia nas partes `source`, se o `classify` no cliente não bastar.
