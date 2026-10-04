# Hands for Bots — Agent Skills

Skills that teach coding agents (Claude Code and other tools that read the [Agent Skills](https://agentskills.io) format) how to integrate Hands for Bots correctly. They describe the library's real, verified behavior, including the pitfalls that are easy to miss.

| Skill | Use it for |
|---|---|
| [`handsforbots`](./handsforbots/SKILL.md) | Setting up the Bot, backends, core and custom plugins, GUI commands (`[•…•]`), MCP tools, events |
| [`handsforbots-history`](./handsforbots-history/SKILL.md) | Reading and extending the session history, recording interface events, decision timelines. Ships a ready-to-use [`history-recorder.js`](./handsforbots-history/scripts/history-recorder.js) |

## Install in your project

Copy the skill folders into your project's `.claude/skills/` directory (or `~/.claude/skills/` to use them in every project):

```bash
mkdir -p .claude/skills
cp -r path/to/handsforbots-repo/skills/handsforbots path/to/handsforbots-repo/skills/handsforbots-history .claude/skills/
```

The agent loads them automatically when your task involves Hands for Bots.

Skills for people who work on the library itself live in [`.claude/skills/`](../.claude/skills/) at the repository root and load automatically when you open this repository.

---

## Instalar no seu projeto (pt-BR)

Skills que ensinam agentes de código (Claude Code e outras ferramentas compatíveis com o formato Agent Skills) a integrar o Hands for Bots corretamente, incluindo as armadilhas fáceis de passar despercebidas.

Copie as pastas das skills para `.claude/skills/` do seu projeto (ou para `~/.claude/skills/` para usar em todos os projetos):

```bash
mkdir -p .claude/skills
cp -r caminho/do/repo-handsforbots/skills/handsforbots caminho/do/repo-handsforbots/skills/handsforbots-history .claude/skills/
```

O agente carrega as skills sozinho quando a tarefa envolve o Hands for Bots. As skills para quem mantém a biblioteca ficam em [`.claude/skills/`](../.claude/skills/), na raiz deste repositório.
