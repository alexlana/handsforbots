# Decisões de arquitetura (ADRs)

Registro curto das decisões da v2: contexto, decisão e consequências. Para mudar uma decisão, escreva um novo ADR que a substitua.

| # | Decisão | Estado |
|---|---------|--------|
| [0001](./0001-kernel-proprio-semantica-cordis.md) | Kernel próprio com semântica de plugins inspirada no Cordis | Aceita |
| [0002](./0002-sinal-turno-estimulo.md) | Modelo Sinal → Turno → Estímulo, com rotas | Aceita |
| [0003](./0003-sincrono-assincrono.md) | Notificações, interceptadores, serviços e API aguardável | Aceita |
| [0004](./0004-plugins-em-codigo.md) | Plugins compostos em código; nada de código remoto | Aceita |
| [0005](./0005-acoes-e-seguranca.md) | Ações declaradas uma vez, com origens, confirmação e allowlist | Aceita |
| [0006](./0006-adapters-substituiveis.md) | Ferramentas externas como adapters substituíveis, provados por conformidade | Aceita |
| [0007](./0007-sem-compatibilidade-v1.md) | Sem compatibilidade com a v1 | Aceita |
| [0008](./0008-persistencia-e-abas.md) | Persistência com prazo garantido (chave que expira, backend) e abas configuráveis | Aceita |
| [0009](./0009-memoria.md) | Política de memória (turnos enviados, guardados e compactados) como plugin montado por padrão | Aceita |
| [0010](./0010-consentimento.md) | Consentimento por finalidade, com regras declarativas por região, apagando o storage ao revogar | Aceita (sobras: ver 0012) |
| [0011](./0011-interrupcao-e-fim-de-turno.md) | Interrupção e retomada no core (texto e voz), fim de turno plugável e barge-in completo na voz | Aceita |
| [0012](./0012-apagar-sobras-sem-montar.md) | Apagar sobras de consentimento negado sem montar o plugin (substitui parte do 0010) | Aceita |
| [0013](./0013-sintese-de-voz-e-efeitos.md) | Síntese de voz com provedores que devolvem áudio, política de carga dos modelos e efeitos em JSON (Web Audio, WAM, SSML) com pontes para SSML e FFmpeg | Aceita |
| [0014](./0014-fontes-e-citacoes.md) | Fontes como parte da mensagem e citações como anotações com posição no texto (marcadores ficam no backend); URLs só absolutas ou âncoras | Aceita |
| [0015](./0015-retorno-da-interrupcao.md) | Sinais de contexto de um turno (`once`); `conversation.interrupted` e `voice.reactions` contam ao backend o que aconteceu enquanto ele respondia | Aceita |
| [0016](./0016-baixar-a-voz-ao-ligar.md) | `first-use` baixa o modelo de voz quando a pessoa liga a voz do bot (ou ao montar com `output: 'voice'`), não só na primeira fala; o microfone não baixa (substitui parte do 0013) | Aceita |
| [0017](./0017-atributos-da-conversa.md) | Atributos da conversa (só códigos) no kernel, exposições em memória até o `analytics`, `baggage` para o backend e contadores de experimento | Aceita |
