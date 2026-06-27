---
name: release
description: Cut a new gemini-voyager release — open-issue triage, preflight checks, version bump, 10-locale changelog, commit, tag, push, curated GitHub release body, Chrome/Firefox artifacts, optional legacy Edge zip, and Safari DMG. Use whenever the user says "发版", "release", "bump", "cut a release", "ship vX.Y.Z", or otherwise signals shipping a new version. Also use when the user wants just an Edge compatibility zip or Safari DMG for an existing release.
user-invocable: true
metadata:
  version: "1.2.1"
---

# Release Workflow

## Overview

Copy this checklist into your response and check items off as you progress. Each step gates the next — don't skip ahead.

**Two places to parallelize for wall-clock (the gates still hold; only the *work* overlaps):** ① In Step 1, run `lint` first (it mutates source) then `typecheck` + `test` + `build:all` concurrently. ② After the Step 5 push, the GitHub Actions job is mostly serial, but the agent's local work is not: monitor CI, run Step 8's Safari CLI archive/export/DMG flow, and draft Step 6's release body at the same time. The AMO signing/submission step often sits quiet for ~3-6 minutes; treat that as normal unless logs show an error. See the ⚡ notes inline.

```
Release Progress:
- [ ] Step 1: Pre-flight (branch, issue triage, typecheck/lint/test/build:all)
- [ ] Step 2: Version bump (bun run bump)
- [ ] Step 3: Changelog in all 10 locales
- [ ] Step 4: Commit + tag locally
- [ ] Step 5: Push (user confirmation required — external action)
- [ ] Step 6: Curated GitHub release body (separate EN + ZH sections)
- [ ] Step 7: Optional Edge compatibility zip (only if explicitly requested)
- [ ] Step 8: Safari DMG sub-flow (Xcode-gated)
- [ ] Step 9: Final check
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

**Verification commands** — all must pass. ⚡ **`lint` runs `eslint . --fix`, so it mutates source — run it FIRST, alone.** Then `typecheck`, `test`, and `build:all` only *read* source (the builds just write `dist_*`), so they're independent and should run **concurrently** — one message, three parallel Bash calls:

```bash
bun run lint          # FIRST, alone — eslint --fix mutates source; inspect the diff it leaves
# then these three in parallel (independent — read source / write dist_*):
bun run typecheck
bun run test
bun run build:all     # chrome + firefox + safari bundles (not the Safari DMG)
```

`build:all` is itself serial (`build:chrome && build:firefox && build:safari`) — three independent Vite builds with separate output dirs; run the three `build:*` scripts concurrently if you want it faster still. `build:all` is cheap and catches broken per-browser Vite configs. If the user is in a hurry and explicitly skips, note it and call out that the Safari bundle wasn't verified.

## Step 2 — Version bump

```bash
bun run bump
```

**Rollover behavior to know**: `scripts/bump-version.js` clamps each digit 0-9 and carries over. `1.3.9` → `1.4.0`, `1.9.9` → `2.0.0`. There's no separate minor/major bump command — bumping at the right cadence is how you land on a minor release. If the user asks to bump to a specific version that's more than one step away, edit `package.json`, `manifest.json`, `manifest.dev.json` manually (all three — bump updates all three together; don't diverge them).

After `bun run bump`, the script also runs `bun run format`. Confirm the new version in all three files:

```bash
grep -E '"version"' package.json manifest.json manifest.dev.json
```

**Also sync the Safari Xcode project version now** — `bun run bump` does NOT touch `project.pbxproj`. It's just a number with no dependency on the Safari build, so do it here at bump time rather than deep in Step 8, where it's easy to forget if anything goes sideways later (e.g. a Chrome publish failure pulls your attention away). Bump both fields for the main app + Extension targets; **leave the Tests targets' `1.0` / `1` alone**:

```bash
PBX="Gemini Voyager/Gemini Voyager.xcodeproj/project.pbxproj"
sed -i '' -e 's/MARKETING_VERSION = {OLD};/MARKETING_VERSION = {NEW};/g' \
          -e 's/CURRENT_PROJECT_VERSION = {OLD};/CURRENT_PROJECT_VERSION = {NEW};/g' "$PBX"
grep -E "MARKETING_VERSION|CURRENT_PROJECT_VERSION" "$PBX" | sort -u   # expect {NEW} + the untouched 1.0 / 1
```

`project.pbxproj` is gitignored, so this won't appear in the Step 4 commit — that's expected; it only needs to be correct locally before the Step 8 archive. If Xcode is open, reopen it so the new version takes effect.

## Step 3 — Changelog (required, all 10 locales)

Write `src/pages/content/changelog/notes/{VERSION}.md` — shown to end users in-product. See **references/changelog.md** for the 10-locale template, per-language section headers, commit-filtering rules, and style guide.

Two things that are easy to miss (full rules in the reference):
- **Write Chinese (`zh`) first**, then render English from it, then the other 8 from English. `en` must still be complete (it's the viewer's fallback locale). Don't reorder the on-disk `<!-- lang:xx -->` sections — they stay en-first.
- **Closing notes are optional, not required.** For hotfixes and security/privacy/permission releases, add one only when it directly fits the theme (responsibility, restraint, trust) and is instantly recognizable. If the line feels decorative, obscure, or like quote-hunting, skip it. Full rules live in `references/changelog.md`.

## Step 4 — Commit + tag

```bash
git add package.json manifest.json manifest.dev.json src/pages/content/changelog/notes/{VERSION}.md
git commit -m "chore: bump to v{VERSION}"
git tag v{VERSION}
```

Stage files explicitly (above) rather than `git add -A` — there may be unrelated files in the working tree.

Commit message stays lowercase and imperative per the project's Conventional Commits rule. No trailing period.

## Step 5 — Push (external action — confirm first)

Pushing the tag triggers `.github/workflows/release.yml`, which creates a public GitHub Release (Chrome zip + Firefox xpi), signs and submits Firefox to AMO, and — as its final step — auto-publishes the Chrome build to the Chrome Web Store via `chrome-webstore-upload-cli` (`--auto-publish`). All of this is visible to users. Confirm with the user before pushing:

> About to push `v{VERSION}` to origin. This triggers the public release workflow: a GitHub Release (Chrome zip + Firefox xpi), Firefox submitted to AMO, and the Chrome build auto-published to the Chrome Web Store (submitted for Google review — not instantly live). OK to push?

Once confirmed:

```bash
git push && git push --tags
```

Monitor the release workflow briefly:

```bash
gh run list --workflow release.yml --limit 3
```

Normal wait points:
- `Build All`: usually about a minute.
- `Sign Firefox Extension and Submit to AMO`: often ~3-6 minutes with little output while `web-ext sign` waits on Mozilla signing/submission. Do not assume this is hung until it clearly exceeds the normal window or logs an error.
- `Publish to Chrome Web Store`: runs last and may fail after upload if Google rejects publication or cannot validate store-listing URLs. The GitHub Release and AMO submission are already complete by then.

If it fails, investigate — common causes: lint failing in CI (not locally because of cache), missing/expired secrets for Firefox signing (`AMO_*`) or Chrome publishing (`CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN` / `CHROME_EXTENSION_ID`), or Chrome Web Store publication checks timing out. The Chrome Web Store step runs **last on purpose**, so if only it fails (expired refresh token, wrong extension id, store-review rejection, temporary URL validation timeout), the GitHub Release and Firefox/AMO submission already went out — just re-publish Chrome (prefer the workflow's manual `publish_only` input with `version={VERSION}`, or upload the Release's Chrome zip via `chrome-webstore-upload-cli`), don't re-cut the version. The `CHROME_REFRESH_TOKEN` can be regenerated locally with `bun run scripts/cws-refresh-token.ts <client_secret.json>`.

> ⚡ **Don't idle during the ~5–6 min CI build.** The remote workflow itself is serial, but local release work can overlap it. The moment the tag is pushed: monitor CI, start Step 8's `ENABLE_SAFARI_UPDATE_CHECK=true bun run build:safari`, then run the `xcodebuild archive` / `xcodebuild -exportArchive` / DMG packaging flow while CI runs. Use the `Any Mac` CLI destination (`generic/platform=macOS`) so the app is universal instead of tied to the current Mac. Apply the release body only after the GitHub Release exists, and upload the Safari DMG only after CI has created the release. This overlaps the CI wait, AMO wait, release-body drafting, and Safari archive/export into one wall-clock window. (Skip this overlap only if Xcode/signing isn't available or the user deferred Safari.)

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

## Step 7 — Optional Edge compatibility zip

Voyager maintains the Edge Add-ons build for users who need Edge on mobile or tablet, so the Installation block includes a Microsoft Edge Add-ons button. The Chrome Web Store build also works in Edge if a store review is delayed.

Skip this step during normal releases. Only run it when the user explicitly asks for an Edge compatibility zip or says they still want to submit a build to the Edge Add-ons partner dashboard.

If needed, build locally:

```bash
bun run build:edge
```

`bun run build:edge` calls `scripts/build-edge.js`, which:
1. Re-runs `bun run build:chrome` (so it overwrites `dist_chrome/`)
2. Strips `key` from `dist_chrome/manifest.json`
3. Zips the contents of `dist_chrome/` as `voyager-edge-v{VERSION}.zip` in the repo root

**Do NOT upload this zip to the GitHub release.** It exists only as an optional compatibility artifact for manual Edge Add-ons submission. `.gitignore` covers `voyager-edge-v*.zip` so it stays untracked.

Side-effect: `dist_chrome/` is now the Edge variant (no `key`), not the Chrome Web Store build. If you plan to dev-load Chrome locally afterwards, re-run `bun run build:chrome` to restore.

Runs anywhere — no Xcode, no code signing.

If the user requested this artifact, reveal the Edge zip in Finder and open the Edge dashboard:

```bash
open -R voyager-edge-v{VERSION}.zip
open https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview
```

## Step 8 — Safari DMG sub-flow

Safari gets its own asset (a signed DMG) because Safari extensions ship as native apps, not webstore uploads. This step requires **full Xcode.app** — `xcrun safari-web-extension-converter` and `xcodebuild archive` both fail with only Command Line Tools.

> ⚡ **Start this right after the Step 5 push** — don't wait for Step 6. The Safari bundle build, `xcodebuild archive`, `xcodebuild -exportArchive`, and DMG packaging can all run from CLI and overlap the CI build (see the ⚡ note in Step 5). Only the final `gh release upload` needs the release to exist.

**First check whether Xcode is available:**

```bash
xcodebuild -version 2>&1
```

- If it prints a version (e.g., `Xcode 15.4`): proceed to **references/safari-dmg.md** for the full flow.
- If it prints `xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory ... is a command line tools instance`: tell the user they can't build the DMG here, note that the GitHub Release went out with Chrome/Firefox (Edge users should use the Chrome Web Store build), and show them how to finish later on a machine with Xcode:
  ```
  # On a machine with Xcode.app
  ENABLE_SAFARI_UPDATE_CHECK=true bun run build:safari
  # ... then follow references/safari-dmg.md from step "Xcode export" onward
  gh release upload v{VERSION} safari/Models/voyager-v{VERSION}.dmg --clobber
  ```
  Do not block the release on Safari — the historical pattern (see v1.3.9) is that the DMG lands a few hours after the main release.

## Step 9 — Final check

- Open the new release page: `gh release view v{VERSION} --web` (only if user asks).
- Confirm asset list. Expected: `voyager-chrome-v{VERSION}.zip`, `voyager-firefox-v{VERSION}.xpi`, and (if Safari sub-flow ran) `voyager-v{VERSION}.dmg`. Any Edge zip from Step 7 lives only on disk, never on the release page.
- Chrome Web Store publish is automatic now (the workflow's final step). To confirm it went through, check that step's log in the workflow run, or the [CWS developer dashboard](https://chrome.google.com/webstore/devconsole) — the new version sits in Google review before it goes live, so it won't be public immediately.
- Summarize in one line what was shipped and what's still pending (if Safari was deferred).

## What NOT to do

- Don't bump on a feature branch and push — tags on non-main cause confusion.
- Don't use `--amend` to fix a bump commit after the tag was created. Create a new commit and move the tag (`git tag -f` + push with `--force-with-lease` — confirm with user).
- Don't publish a release without a changelog file in `src/pages/content/changelog/notes/`. The in-product changelog viewer will show a broken entry.
- Don't translate changelog via obvious machine output ("literal" Japanese/Arabic). Follow the style of prior release notes.
- Don't `git push --no-verify` or bypass hooks. If a hook fails, fix the underlying issue.
