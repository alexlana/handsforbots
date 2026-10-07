# 0009 — Política de memória como plugin montado por padrão

**Contexto.** Cada peça limitava o histórico de um jeito: os storages guardavam as últimas 200 **mensagens**, o corpo padrão do `http` enviava 20 mensagens (fixo), o `universalLLM` 10, e o `agui` e o `aiSdk` enviavam o histórico inteiro a cada turno, crescendo sem limite. Não havia compactação. Contar mensagens partia pares chamada/resultado de ação e não correspondia ao que as pessoas entendem como "turno".

**Decisão.**
- Novo pacote `@handsforbots/memory`, um plugin com três regras medidas em **turnos**: `send` (quantos vão em cada requisição, padrão 20, `'all'` ou `'none'`), `keep` (quantos ficam no histórico e no storage, padrão 100, nunca menos que `send`) e `compact` (o que fazer com os turnos que saem da janela: `'local'` por padrão, um `Summarizer` como `httpSummarizer`, ou `false`).
- O resumo vai como o sinal de contexto `memory.summary`, que todos os transportes já repassam; nenhum transporte muda. Ele é atualizado antes de cada requisição (interceptador `request.before` aguardável), então nenhum turno é descartado sem resumo. Com compactação, `keep` só remove turnos que já estão no resumo.
- O kernel grava `turnId` em cada mensagem (o job que a criou: turno, `runAction` ou `push`), e o `SessionSnapshot` ganha o campo opaco `memory`, guardado e restaurado com a conversa.
- O `createH4B` monta `memory()` por padrão. `createH4B({ memory: opções })` configura, `memory: false` desliga, e um `memory(...)` em `plugins` substitui o padrão. Os storages perdem `maxMessages`.

**Consequências.** Todos os transportes enviam no máximo 20 turnos mais um resumo, sem configuração. O `@handsforbots/memory` importa só tipos do `core` (sem import em runtime), porque o `core` depende dele para montá-lo; o pnpm avisa sobre a dependência cíclica entre os dois pacotes do workspace, que é só de tipos. Turnos removidos por `keep` somem da tela também. Com `tab-sync` em `sync`, a mesclagem por união pode trazer de volta mensagens que outra aba removeu, até a próxima manutenção depois de um job. O resumo local é grosseiro; para qualidade, use um `Summarizer` no backend.
