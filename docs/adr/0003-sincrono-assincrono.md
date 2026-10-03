# 0003 — Síncrono e assíncrono

**Contexto.** Na v1 tudo era evento, sem distinguir "avisar" de "esperar uma decisão". Erros de um listener podiam quebrar a cadeia.

**Decisão.** Quatro mecanismos, todos aceitando funções síncronas ou assíncronas: notificações (`on`, nunca bloqueiam; falhas isoladas), interceptadores (`intercept`, aguardados por prioridade, podem transformar ou vetar: `signal.before`, `request.before`, `action.before`, `stimulus.before`), contratos de serviço (aguardados) e a API aguardável do host (`ask`, `runAction`, `when`, `push`). Turnos rodam um por vez; triggers na fila aparecem no snapshot (`queued`).

**Consequências.** O fluxo é previsível e testável. Quem precisa interferir usa interceptadores; quem só observa não atrasa nada.
