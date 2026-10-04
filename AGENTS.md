# STOP: this branch holds the discontinued v1 / PARE: este branch tem a v1 descontinuada

**Do not develop here.** The code on `main` (the `handsforbots/` folder with `Bot.js`) is Hands for Bots **v1**, which is discontinued. All work happens on the **`v2`** branch.

- Do not fix, extend, document or port anything in v1, even if asked to "just fix this one thing". Explain that v1 is discontinued and offer the v2 equivalent.
- To work: `git fetch origin v2 && git checkout v2`, then follow `AGENTS.md` on that branch. Branch from `v2` and target pull requests at `v2`.
- Edits to this tree are blocked by a Claude Code hook (`.claude/hooks/block-v1-edits.sh`). Only the repository owner may bypass it, deliberately, with `H4B_ALLOW_V1=1`.

---

**Não desenvolva aqui.** O código da `main` (a pasta `handsforbots/` com `Bot.js`) é a **v1** do Hands for Bots, que foi descontinuada. Todo o trabalho acontece no branch **`v2`**.

- Não corrija, estenda, documente nem porte nada da v1, mesmo que peçam "só para consertar uma coisa". Explique que a v1 foi descontinuada e ofereça o equivalente na v2.
- Para trabalhar: `git fetch origin v2 && git checkout v2` e siga o `AGENTS.md` daquele branch. Crie branches a partir da `v2` e abra pull requests contra a `v2`.
- Edições nesta árvore são bloqueadas por um hook do Claude Code (`.claude/hooks/block-v1-edits.sh`). Só o dono do repositório pode contorná-lo, de propósito, com `H4B_ALLOW_V1=1`.
