#!/usr/bin/env bash
# SessionStart: puts the v1 notice into every Claude Code session opened on this tree.
cat <<'MSG'
[handsforbots] This checkout is Hands for Bots v1, which is DISCONTINUED. Do not develop, fix or document v1.
All work happens on the `v2` branch: run `git fetch origin v2 && git checkout v2` and follow AGENTS.md there.
Edits to this tree are blocked by a hook. If the user asks for a v1 change, explain this and offer the v2 equivalent.

[handsforbots] Este checkout é a v1 do Hands for Bots, DESCONTINUADA. Não desenvolva, corrija nem documente a v1.
Todo o trabalho acontece no branch `v2`: rode `git fetch origin v2 && git checkout v2` e siga o AGENTS.md de lá.
Edições nesta árvore são bloqueadas por um hook. Se pedirem uma mudança na v1, explique isso e ofereça o equivalente na v2.
MSG
