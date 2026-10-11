# 0012 — Apagar sobras de consentimento negado sem montar o plugin

**Contexto.** O [ADR 0010](./0010-consentimento.md) apagava o que uma visita anterior deixou montando o plugin por um instante quando a finalidade vinha `denied`, e desmontando em seguida. Montar roda o `apply` inteiro, então qualquer efeito dele acontecia com a finalidade recusada: um `withConsent(observability({ exporters }), 'analytics')` ligava o exporter mesmo com `analytics` negado. Isso contradiz a promessa do próprio ADR 0010 (plugin condicionado só monta com a finalidade concedida) e só podia ser contornado no app, perdendo o apagamento automático.

**Decisão.** Substitui a última frase do segundo item da decisão do ADR 0010.

- Com a finalidade fora de `granted`, o `apply` de um plugin condicionado **nunca** roda.
- `definePlugin` ganha `erase?(app, config)`: apaga o que uma visita anterior guardou, sem montar. O kernel chama uma vez por `start()`, quando a finalidade está `denied` e a regra apaga ao revogar (`eraseOnRevoke`), com o `config` já validado. Erros vão para `emit('error', { source: 'consent' })`.
- Plugin condicionado sem `erase` fica intocado enquanto negado: não há o que apagar sem montá-lo.
- `storage-local` e `storage-backend` implementam `erase` com o que já faziam ao revogar (`forget()`; no backend, `DELETE` só se houver id, e depois `forget()`).

**Consequências.** Plugins de terceiros que guardam algo fora de um `storage` e contavam com o `ctx.onRevoke` para limpar sobras de visitas anteriores precisam implementar `erase`; o `onRevoke` continua valendo para a revogação durante a visita. Nenhum evento `plugin.mounted` sai para plugins negados.
