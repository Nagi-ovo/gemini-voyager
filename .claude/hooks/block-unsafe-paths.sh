#!/bin/bash
# PreToolUse hook: block Write|Edit on dist_*/ and .env secret files.
# Reads JSON from stdin, extracts tool_input.file_path, exits 2 (block) if unsafe.

input=$(cat)
file_path=$(printf '%s' "$input" \
  | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | head -1 \
  | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')

[ -z "$file_path" ] && exit 0

if [[ "$file_path" == */dist_*/* ]]; then
  echo "BLOCKED: $file_path is under dist_*/ — never modify build output directly (CLAUDE.md)" >&2
  exit 2
fi

filename=$(basename "$file_path")
if [[ "$filename" =~ ^\.env(\.(local|development|production|staging))?$ ]]; then
  echo "BLOCKED: $file_path is a secrets env file — never commit .env (CLAUDE.md)" >&2
  exit 2
fi

exit 0
