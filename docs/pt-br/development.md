# Desenvolvimento

Requisitos: Node 20+ e pnpm 10.

```bash
pnpm install
pnpm test        # Vitest em todos os pacotes + node:test na semantic-event-observability
pnpm typecheck
pnpm build       # gera dist/ em cada pacote (os exports passam para dist/ na publicação)
```

Estrutura:

```
packages/<nome>/src     fontes TypeScript (os exports apontam para cá dentro do workspace)
packages/<nome>/test    Vitest (jsdom quando precisa de DOM)
test/                   verificações do repositório (créditos de terceiros)
examples/react-agui     React + AG-UI + voz + WebMCP, com agente simulado (pnpm)
examples/vite           Rasa + widget + tours guiados + observabilidade (Docker ou npm)
```

Rodando os exemplos:

```bash
pnpm --filter @handsforbots/example-react-agui dev
cd examples && docker compose up            # exemplo Rasa (veja examples/README.md)
```

Convenções:

- Um pacote por capacidade; plugins não importam uns aos outros em runtime (só tipos), descobrem serviços via `ctx.get()`.
- Todo comportamento tem teste; testes que dependem de tempo esperam condições, não atrasos fixos.
- Pacote de terceiros novo (qualquer `package.json`, ou módulo que o hospedeiro carrega para nós) entra no [`NOTICE.md`](./NOTICE.md) e no [`NOTICE.md` em inglês](../../NOTICE.md) com uso e licença; senão o `pnpm test` falha. Código copiado também.
- Bibliotecas, serviços, especificações e artigos por trás de uma decisão entram nas [Referências](./references.md) (nos dois idiomas), na seção do tema.
- Decisões de arquitetura e estado do projeto ficam no [ROADMAP.md](../../ROADMAP.md).
