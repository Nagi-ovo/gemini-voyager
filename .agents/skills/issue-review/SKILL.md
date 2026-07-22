---
name: issue-review
description: Investigate, review, and fix GitHub issues. Use when a request references a GitHub issue URL or number and asks for analysis, root-cause location, implementation, or a fix commit.
---

# Issue Review

1. Begin with `gh-anon issue view <number-or-url> --comments` (add `--repo owner/repo` when needed). Read the actual issue before locating the cause in the repository.
2. If implementing the fix, validate it and create one scoped commit whose message or footer contains `Closes #<number>` or `Fixes #<number>`.
3. Before finishing, verify the committed file scope and the closing keyword with `git show --stat --format=fuller HEAD`.
4. Do not manually close the Issue before the fix lands on `main`. After merge, verify the closing keyword took effect; only if it did not, close the Issue with `gh-anon issue close` when authorized. Then post a short reply in the reporter's language saying the fix has landed, will be available in the next version, and the Issue may be reopened if the problem remains. Before writing, verify `gh-anon api user --jq .login` returns `anontokyo-dev`.
