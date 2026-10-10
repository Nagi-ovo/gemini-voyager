---
name: pr-description
description: Write or rewrite a Voyager pull request description.
---

Read the full PR diff, then fill `.github/pull_request_template.md`. Its first three sections:

- **Why the change**: one sentence on the problem solved and what it enables.
- **Special things to note**: 1–3 bullets on reviewer warnings, data compatibility, deliberate omissions or surprising decisions; `- None.` when there are none.
- **Change outline**: the fewest structural views that explain the change (file tree of responsibilities, call or data-flow tree, key types), as `diff` blocks for changed shapes and plain blocks for new ones, never a file-by-file changelog.

Publish with `gh pr edit <number> --body-file <file>`.
