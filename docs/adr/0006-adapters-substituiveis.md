# 0006 — Ferramentas externas como adapters substituíveis

**Contexto.** AG-UI e CopilotKit são prioridade, mas o mercado muda rápido (AI SDK, assistant-ui, Rasa, APIs próprias).

**Decisão.** Nenhuma ferramenta externa entra no core. Cada uma é um adapter: transportes (`agui`, `aiSdk`, `rasa`, `http`/`universalLLM`/`openAICompatible`, CopilotKit) e superfícies (`widget`, `react`, `assistant-ui`, CopilotKit). A substituibilidade é provada por uma suíte de conformidade (`@handsforbots/testkit`) que todos os transportes passam, e por testes contra as bibliotecas reais quando possível (AI SDK `streamText`, assistant-ui runtime). Implementamos clientes de protocolo próprios quando a lib oficial pesa demais (SSE do AG-UI: bundle de 539 → 257 kB).

**Consequências.** Trocar de fornecedor é trocar um plugin. Cada adapter tem o custo de acompanhar seu protocolo, mitigado pelos testes.
