# Hands for Bots — Agent Skills

Skills that teach coding agents (Claude Code and other tools that read the [Agent Skills](https://agentskills.io) format) how to integrate Hands for Bots v2 correctly. They describe the library's verified behavior, including the details that are easy to miss.

| Skill | Use it for |
|---|---|
| [`handsforbots`](./handsforbots/SKILL.md) | Kernel setup, transports, actions, context signals, widget/React, plugins. Reference: [`runtime.md`](./handsforbots/references/runtime.md) |
| [`handsforbots-history`](./handsforbots-history/SKILL.md) | Reading the history, recording GUI decisions with `runAction`, decision timelines. Ships [`timeline.ts`](./handsforbots-history/scripts/timeline.ts) |
| [`handsforbots-persistence`](./handsforbots-persistence/SKILL.md) | Memory (turns sent, kept, compacted), browser or server storage, encryption with an expiring key, retention choices, tab modes, and the server endpoints |
| [`handsforbots-consent`](./handsforbots-consent/SKILL.md) | Working with a consent tool: purposes, rule sets per legislation and region (JSON/YAML), erasing storage on revoke, anonymization for human review |

## Install in your project

Copy the skill folders into your project's `.claude/skills/` (or `~/.claude/skills/` for every project):

```bash
mkdir -p .claude/skills
cp -r path/to/handsforbots/skills/handsforbots path/to/handsforbots/skills/handsforbots-history path/to/handsforbots/skills/handsforbots-persistence path/to/handsforbots/skills/handsforbots-consent .claude/skills/
```

The agent loads them when your task involves Hands for Bots. Skills for working on the library itself live in [`.claude/skills/`](../.claude/skills/) and load automatically in this repository.

## Instalar no seu projeto (pt-BR)

Skills que ensinam agentes de código a integrar o Hands for Bots v2 corretamente. Copie as pastas para `.claude/skills/` do seu projeto (ou `~/.claude/skills/` para todos os projetos):

```bash
mkdir -p .claude/skills
cp -r caminho/do/handsforbots/skills/handsforbots caminho/do/handsforbots/skills/handsforbots-history caminho/do/handsforbots/skills/handsforbots-persistence caminho/do/handsforbots/skills/handsforbots-consent .claude/skills/
```

As skills para quem mantém a biblioteca ficam em [`.claude/skills/`](../.claude/skills/) e carregam sozinhas neste repositório.
