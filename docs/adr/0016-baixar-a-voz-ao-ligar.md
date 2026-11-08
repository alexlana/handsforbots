# 0016 — `first-use` baixa o modelo de voz quando a pessoa liga a voz do bot

**Contexto.** No [0013](./0013-sintese-de-voz-e-efeitos.md), `load.start: 'first-use'` (o padrão) começava o download na primeira frase que o bot ia falar. Nessa hora a pergunta já foi feita e a resposta já chegou: com modelos de 15 a 300 MB, a primeira resposta sai na voz reserva (`fallback`) ou muda (`silent`, ou sem reserva pronta). Num teste real com Piper, a primeira resposta veio só em texto no Chrome e a segunda falou. Mas a pessoa já mostrou antes que quer ouvir o bot, quando ligou a voz dele.

**Decisão.** Com `first-use`, o download começa no primeiro destes, o que vier antes:

- `setOutput('voice')` ou `setOutput('auto')`: a pessoa ligou a voz do bot (o botão de alto-falante do widget passa de `text` para `auto`);
- a primeira frase a ser falada (como antes);
- a montagem do plugin, quando quem integra define `output: 'voice'`: a voz é a forma padrão de responder.

O microfone (`listen()`) não baixa nada: a pessoa falar não quer dizer que ela quer ouvir o bot. O `output` padrão (`'auto'`) também não baixa ao montar, senão todo visitante baixaria o modelo. `eager`, `idle` e `manual` não mudam; com `manual`, nada baixa sem `loadSpeech()`.

**Consequências.** Quem liga a voz do bot baixa o modelo enquanto escreve ou fala a pergunta, e a primeira resposta tem mais chance de sair na voz do modelo. Apps com `output: 'voice'` baixam o modelo para todo visitante, como o `eager`. Para pedir permissão antes de baixar (dados móveis, tamanho), use `manual`.
