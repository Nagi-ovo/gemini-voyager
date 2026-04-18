---
name: release
description: Cut a new gemini-voyager release — open-issue triage, preflight checks, version bump, 10-locale changelog, commit, tag, push, curated GitHub release body, and Safari DMG. Use whenever the user says "发版", "release", "bump", "cut a release", "ship vX.Y.Z", or otherwise signals shipping a new version. Also use when the user wants just a Safari DMG for an existing release.
user-invocable: true
---

# Release Workflow

## Overview

Copy this checklist into your response and check items off as you progress. Each step gates the next — don't skip ahead.

```
Release Progress:
- [ ] Step 1: Pre-flight (branch, issue triage, typecheck/lint/test/build:all)
- [ ] Step 2: Version bump (bun run bump)
- [ ] Step 3: Changelog in all 10 locales
- [ ] Step 4: Commit + tag locally
- [ ] Step 5: Push (user confirmation required — external action)
- [ ] Step 6: Curated GitHub release body (separate EN + ZH sections)
- [ ] Step 7: Safari DMG sub-flow (Xcode-gated)
- [ ] Step 8: Final check
```

## Step 1 — Pre-flight

Do these before touching the version. Bail out if any fails and surface the failure to the user.

**Branch / worktree**
- Confirm branch is `main` (or whatever the user explicitly asks). If not, stop and ask.
- `git status` should show no unrelated modified files. Version files from a previous aborted bump (`package.json`, `manifest.json`, `manifest.dev.json`) are OK — they'll be overwritten.

**Open-issue triage** — read `gh issue list --state open --limit 100 --json number,title,labels,createdAt,updatedAt,author`. Scan for:
- Recent (non-stale) bug reports that would embarrass us if we shipped without them fixed.
- Issues with the `important` label that haven't been addressed.
- Owner (`Nagi-ovo`) replies that promised something for this release.

Summarize candidates to the user in a short table (`#`, title, status judgment, block/not-block). Ask whether to proceed. Do not silently skip this — a release without issue awareness tends to produce follow-up patch releases.

**Verification commands** — run all of these; all must pass:

```bash
bun run typecheck
bun run lint
bun run test
bun run build:all   # chrome + firefox + safari bundles (not the Safari DMG)
```

`build:all` is cheap and catches broken per-browser Vite configs. If the user is in a hurry and explicitly skips, note it and move on, but call out that the Safari bundle wasn't verified.

## Step 2 — Version bump

```bash
bun run bump
```

**Rollover behavior to know**: `scripts/bump-version.js` clamps each digit 0-9 and carries over. `1.3.9` → `1.4.0`, `1.9.9` → `2.0.0`. There's no separate minor/major bump command — bumping at the right cadence is how you land on a minor release. If the user asks to bump to a specific version that's more than one step away, edit `package.json`, `manifest.json`, `manifest.dev.json` manually (all three — bump updates all three together; don't diverge them).

After `bun run bump`, the script also runs `bun run format`. Confirm the new version in all three files:

```bash
grep -E '"version"' package.json manifest.json manifest.dev.json
```

## Step 3 — Changelog (required, all 10 locales)

Write `src/pages/content/changelog/notes/{VERSION}.md` — shown to end users in-product. See **references/changelog.md** for the 10-locale template, per-language section headers, commit-filtering rules, and translation style guide.

## Step 4 — Commit + tag

```bash
git add package.json manifest.json manifest.dev.json src/pages/content/changelog/notes/{VERSION}.md
git commit -m "chore: bump to v{VERSION}"
git tag v{VERSION}
```

Stage files explicitly (above) rather than `git add -A` — there may be unrelated files in the working tree.

Commit message stays lowercase and imperative per the project's Conventional Commits rule. No trailing period.

## Step 5 — Push (external action — confirm first)

Pushing the tag triggers `.github/workflows/release.yml`, which creates a public GitHub Release and uploads Chrome zip + Firefox xpi. This is visible to users. Confirm with the user before pushing:

> About to push `v{VERSION}` to origin. This triggers the public GitHub Release workflow (Chrome zip + Firefox xpi will be built and published automatically). OK to push?

Once confirmed:

```bash
git push && git push --tags
```

Monitor the release workflow briefly:

```bash
gh run list --workflow release.yml --limit 3
```

If it fails, investigate — common causes: lint failing in CI (not locally because of cache), missing required secrets for Firefox signing.

## Step 6 — Curated GitHub release body (required every release)

The workflow auto-populates the release body with `gh api releases/generate-notes` + an Installation block. That auto-body is a fallback, **not** what ships. Every release should replace the top portion with curated tables in **separate English and Chinese sections** (not mixed per cell — that earlier style was noisy for both audiences). The tables pick only user-facing changes and attribute each to its PR or commit.

This is a judgment step — filtering commits, writing short descriptions in each language, mapping commits to PRs — and belongs in the skill, not the workflow YAML.

**What to do:**

1. Read **references/release-body.md** for the full template, the commit-filtering rules, and a worked example (v1.3.9).
2. Generate `release_body.md` with two tables (✨ What's New / 🐛 Bug Fixes) + a contributors section + Full Changelog link.
3. Overwrite the release body, **preserving the workflow's Installation + Safari block** at the bottom:
   ```bash
   CURRENT=$(gh release view v{VERSION} --json body --jq '.body')
   TAIL=$(echo "$CURRENT" | awk '/^## 📥 Installation/{flag=1} flag')
   printf "%s\n\n%s" "$(cat release_body.md)" "$TAIL" > final_body.md
   gh release edit v{VERSION} --notes-file final_body.md
   ```
4. Open `gh release view v{VERSION} --web` and eyeball the result — the table renders fine, Installation badges still show, Safari block still appears.

If the workflow's `## 📥 Installation` marker is missing (e.g., workflow failed partway), don't blindly strip — check what's there first, then paste the Installation block from the workflow YAML manually.

## Step 7 — Safari DMG sub-flow

Safari gets its own asset (a signed DMG) because Safari extensions ship as native apps, not webstore uploads. This step requires **full Xcode.app** — `xcrun safari-web-extension-converter` and `xcodebuild archive` both fail with only Command Line Tools.

**First check whether Xcode is available:**

```bash
xcodebuild -version 2>&1
```

- If it prints a version (e.g., `Xcode 15.4`): proceed to **references/safari-dmg.md** for the full flow.
- If it prints `xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory ... is a command line tools instance`: tell the user they can't build the DMG here, note that the GitHub Release went out with just Chrome/Firefox, and show them how to finish later on a machine with Xcode:
  ```
  # On a machine with Xcode.app
  ENABLE_SAFARI_UPDATE_CHECK=true bun run build:safari
  # ... then follow references/safari-dmg.md from step "Xcode export" onward
  gh release upload v{VERSION} safari/Models/voyager-v{VERSION}.dmg --clobber
  ```
  Do not block the release on Safari — the historical pattern (see v1.3.9) is that the DMG lands a few hours after the main release.

## Step 8 — Final check

- Open the new release page: `gh release view v{VERSION} --web` (only if user asks).
- Confirm asset list. Expected: `voyager-chrome-v{VERSION}.zip`, `voyager-firefox-v{VERSION}.xpi`, and (if Safari sub-flow ran) `voyager-v{VERSION}.dmg`.
- Summarize in one line what was shipped and what's still pending (if Safari was deferred).

## What NOT to do

- Don't bump on a feature branch and push — tags on non-main cause confusion.
- Don't use `--amend` to fix a bump commit after the tag was created. Create a new commit and move the tag (`git tag -f` + push with `--force-with-lease` — confirm with user).
- Don't publish a release without a changelog file in `src/pages/content/changelog/notes/`. The in-product changelog viewer will show a broken entry.
- Don't translate changelog via obvious machine output ("literal" Japanese/Arabic). Follow the style of prior release notes.
- Don't `git push --no-verify` or bypass hooks. If a hook fails, fix the underlying issue.
