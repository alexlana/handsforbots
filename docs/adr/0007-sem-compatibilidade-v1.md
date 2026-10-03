# 0007 — Sem compatibilidade com a v1

**Contexto.** A v1 não tinha implantações relevantes, e manter compatibilidade (action tags, eventos `core.*`, carregamento por caminho) atrasaria e contaminaria o desenho novo.

**Decisão.** A v2 é uma reescrita. Cada recurso da v1 ganhou um destino na v2 ou uma aposentadoria documentada ([guia de migração](../pt-br/migrating-from-v1.md)); a pasta da v1 foi removida depois que os exemplos rodaram na v2.

**Consequências.** O exemplo Rasa precisou de um ajuste no `domain.yml` (`custom.h4b` em vez de action tags) e de um novo `rasa train`. A v1 continua acessível no histórico do git.
