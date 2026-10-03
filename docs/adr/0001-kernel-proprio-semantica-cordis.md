# 0001 — Kernel próprio com semântica de plugins inspirada no Cordis

**Contexto.** O DeepSeek Harness mostrou que "tudo é plugin" (até o loop e o transporte) funciona bem com a semântica do Cordis: `name`, `inject`, `apply(ctx)`, serviços com chave estável e descarte automático do que o plugin registrou. Mas o Cordis/DSH é pensado para Node, com gerenciamento pelo backend.

**Decisão.** Escrever um kernel pequeno (`@handsforbots/core`, sem DOM, sem dependências) com a mesma semântica: `definePlugin({ name, inject, provides, config, apply })`, `ctx.provide/get`, registros com escopo e descarte, montagem por dependências e em runtime (`h4b.use`). Tipos de serviços e eventos estendidos por declaration merging.

**Consequências.** Funciona igual no navegador e no Node e cabe em poucos kB. Não herdamos o ecossistema do Cordis. A API do kernel tem versão (`apiVersion: 2`) e o kernel recusa plugins de outra versão.
