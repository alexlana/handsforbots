# Segurança

O H4B permite que software (um LLM, um bot de regras, um agente externo no navegador) aja numa sessão real do usuário. Trate toda chamada de ação como entrada não confiável.

- **Só ações registradas rodam.** Não há busca em `window[...]` nem código vindo de mensagens (as action tags da v1 acabaram). Os argumentos são validados contra o schema da ação antes do handler.
- **Origens.** As chamadas vêm de `user` (menu, botões, `runAction`), `assistant` (tool calls do seu backend) ou `agent` (WebMCP). Use `exposeTo` para limitar quem vê e chama uma ação; o `expose-webmcp` só publica ações que incluam `'agent'` explicitamente.
- **Confirmação.** `destructive: true` (ou `confirm: 'always'`) consulta o serviço `confirm` para qualquer origem. Sem serviço `confirm`, essas chamadas são recusadas.
- **Interceptadores.** `action.before` pode vetar ou reescrever qualquer chamada (limites, regras de negócio); `request.before` pode ocultar dados antes de saírem do navegador; `signal.before` pode descartar entradas.
- **Segredos.** Chaves não pertencem ao navegador. Use `httpSTT`/`httpTTS`, `websocketSTT` com tokens temporários, `universalLLM` ou `http` apontando para o seu backend. O `openAICompatible` avisa quando uma chave é usada fora do localhost.
- **Renderização.** O widget escapa todo texto e renderiza um subconjunto pequeno de Markdown; links só podem ser http(s), mailto, tel ou relativos, e as imagens da galeria passam pelo mesmo filtro. Renderizadores próprios recebem props do backend: trate-as como não confiáveis.
- **Privacidade.** O `observability` não registra o conteúdo das mensagens, salvo `includeContent: true`. Sensores e câmera são opt-in e mostram seu estado; o `storage-local` guarda a conversa no navegador (use `area: 'session'` ou um `ttlMinutes` curto em dispositivos compartilhados).
