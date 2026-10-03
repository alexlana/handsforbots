# 0005 — Ações declaradas uma vez, com origens, confirmação e allowlist

**Contexto.** A v1 executava `window[command.action]` a partir do texto do LLM. Agora LLMs, menus, agentes do navegador (WebMCP) e apps embutidos (MCP Apps) podem agir na sessão do usuário.

**Decisão.** Só ações registradas rodam, com schema validado antes do handler. Cada chamada tem origem (`user` > `assistant` > `agent`); `exposeTo` limita quem vê e chama; `destructive` exige o serviço `confirm` para qualquer origem (sem ele, recusa). WebMCP publica só ações com `'agent'` explícito; MCP Apps só chamam ações de uma allowlist. `action.before` permite vetar qualquer chamada.

**Consequências.** Uma mesma ação serve ao assistente, ao menu e a agentes externos sob as mesmas regras, e toda execução fica no histórico com sua origem.
