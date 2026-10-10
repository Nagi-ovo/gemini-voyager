#!/bin/bash
# PreToolUse hook on `git push`: format the files changed in the outgoing
# commits, and block the push (exit 2) if oxfmt had to rewrite anything,
# so formatting lands in a commit before it reaches CI. Deliberately scoped
# to outgoing files only — uncommitted work-in-progress is never touched.

command -v python3 >/dev/null 2>&1 || exit 0

# The `if` filter also matches commands that only mention `git push` (inside a
# quoted prompt, say), and the push may run in a worktree rather than the
# project root. Parse the real command so only an actual push is formatted,
# in the directory it pushes from.
repo=$(python3 -c '
import json, os, shlex, sys

data = json.load(sys.stdin)
command = data.get("tool_input", {}).get("command", "")
here = data.get("cwd") or os.getcwd()
try:
    lexer = shlex.shlex(command.replace("\n", " ; "), posix=True, punctuation_chars=";&|")
    lexer.whitespace_split = True
    tokens = list(lexer)
except ValueError:
    sys.exit(0)

segments = [[]]
for token in tokens:
    if token and set(token) <= set(";&|"):
        segments.append([])
    else:
        segments[-1].append(token)

for words in segments:
    while words and "=" in words[0] and not words[0].startswith("-"):
        words = words[1:]
    if len(words) >= 2 and words[0] == "cd":
        here = os.path.join(here, os.path.expanduser(words[1]))
        continue
    if not words or words[0] != "git":
        continue
    target, i = here, 1
    while i < len(words) and words[i].startswith("-"):
        if words[i] == "-C" and i + 1 < len(words):
            target = os.path.join(target, words[i + 1])
            i += 2
        elif words[i] == "-c":
            i += 2
        else:
            i += 1
    if i < len(words) and words[i] == "push":
        print(target)
        break
' 2>/dev/null) || exit 0
[ -n "$repo" ] || exit 0
cd "$repo" 2>/dev/null || exit 0
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# Use the project's pinned oxfmt. bunx in a worktree without node_modules would
# fetch the latest release, whose output can differ from the version CI runs.
oxfmt=""
for candidate in "$root/node_modules/.bin/oxfmt" "${CLAUDE_PROJECT_DIR:-}/node_modules/.bin/oxfmt"; do
  if [ -x "$candidate" ]; then
    oxfmt="$candidate"
    break
  fi
done
[ -n "$oxfmt" ] || exit 0

# Outgoing = committed locally but not on the upstream branch. No upstream
# (new branch) or nothing outgoing -> let the push through untouched.
files=$(git diff --name-only @{u}..HEAD 2>/dev/null) || exit 0
[ -n "$files" ] || exit 0

targets=()
before=()
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in
    dist_*|node_modules/*) continue ;;
  esac
  case "$f" in
    *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.md|*.html|*.yml|*.yaml) ;;
    *) continue ;;
  esac
  targets+=("$f")
  before+=("$(git hash-object "$f")")
done <<< "$files"

[ "${#targets[@]}" -gt 0 ] || exit 0

# oxfmt reads .oxfmtrc.jsonc, so the paths it ignores are skipped here too. A
# set that is entirely ignored leaves it with no target file, which it treats
# as an error unless --no-error-on-unmatched-pattern says otherwise.
"$oxfmt" --no-error-on-unmatched-pattern "${targets[@]}" >/dev/null 2>&1

changed=0
for i in "${!targets[@]}"; do
  if [ "${before[$i]}" != "$(git hash-object "${targets[$i]}")" ]; then
    changed=1
    echo "reformatted: ${targets[$i]}" >&2
  fi
done

if [ "$changed" -eq 1 ]; then
  echo "oxfmt reformatted outgoing files (listed above). Commit the formatting changes, then push again." >&2
  exit 2
fi
exit 0
