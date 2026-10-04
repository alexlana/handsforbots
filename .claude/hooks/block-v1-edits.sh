#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit|NotebookEdit): refuses file edits inside a v1 checkout.
# Edits outside the repository (scratch files) are allowed. Deliberate bypass: H4B_ALLOW_V1=1.

[ "${H4B_ALLOW_V1:-}" = "1" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# Only while this checkout is still v1 (after switching to v2 the hook files are gone anyway).
[ -f "$root/handsforbots/Bot.js" ] || exit 0

input="$(cat)"
path="$(printf '%s' "$input" | grep -oE '"(file_path|notebook_path)"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n 1 | sed -E 's/.*:[[:space:]]*"([^"]*)"$/\1/')"
[ -z "$path" ] && exit 0
case "$path" in
  /*) abs="$path" ;;
  *) abs="$root/$path" ;;
esac
case "$abs" in
  "$root"/*) ;;
  *) exit 0 ;;
esac

cat >&2 <<'MSG'
Blocked: this checkout is Hands for Bots v1, which is discontinued. Do not edit it.
Switch to the v2 branch (git fetch origin v2 && git checkout v2) and make the change there, or tell the user v1 is discontinued and offer the v2 equivalent.
Bloqueado: este checkout é a v1 do Hands for Bots, descontinuada. Não edite. Mude para o branch v2 e faça a mudança lá, ou explique que a v1 foi descontinuada e ofereça o equivalente na v2.
MSG
exit 2
