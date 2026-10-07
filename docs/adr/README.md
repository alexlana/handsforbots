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
