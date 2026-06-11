#!/bin/bash
# PreToolUse hook on `git push`: format the files changed in the outgoing
# commits, and block the push (exit 2) if Prettier had to rewrite anything,
# so formatting lands in a commit before it reaches CI. Deliberately scoped
# to outgoing files only — uncommitted work-in-progress is never touched.

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
command -v bunx >/dev/null 2>&1 || exit 0

# Outgoing = committed locally but not on the upstream branch. No upstream
# (new branch) or nothing outgoing -> let the push through untouched.
files=$(git diff --name-only @{u}..HEAD 2>/dev/null) || exit 0
[ -n "$files" ] || exit 0

changed=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in
    dist_*|node_modules/*) continue ;;
  esac
  case "$f" in
    *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.md|*.html|*.yml|*.yaml) ;;
    *) continue ;;
  esac
  before=$(git hash-object "$f")
  bunx prettier --write --ignore-unknown "$f" >/dev/null 2>&1
  after=$(git hash-object "$f")
  if [ "$before" != "$after" ]; then
    changed=1
    echo "reformatted: $f" >&2
  fi
done <<< "$files"

if [ "$changed" -eq 1 ]; then
  echo "Prettier reformatted outgoing files (listed above). Commit the formatting changes, then push again." >&2
  exit 2
fi
exit 0
