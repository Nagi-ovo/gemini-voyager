# Normal Voyager Release

Follow this reference for a new release or interrupted preparation. Resume from verified state; do not bump an already-prepared version again.

## 1. Establish scope

### Branch and worktree

- Release from `main` unless the user explicitly chooses another branch.
- Inspect `git status --short --branch -uall`. Preserve unrelated changes and never use `git add -A`.
- Release files left from an interrupted attempt are acceptable only after verifying their target version and contents.

### Commit range

Derive the scope from the last released tag, not from unpushed commits:

```bash
PREV_TAG=$(git describe --tags --abbrev=0)
git log "${PREV_TAG}..HEAD" --format='%h %s' --no-merges
git rev-list --count "${PREV_TAG}..HEAD"
```

Use this same range for both the in-product changelog and GitHub release body.

### Open issues

Read the current open issues and briefly classify recent bugs, `important` issues, and maintainer promises as blocking or non-blocking:

```bash
gh issue list --state open --limit 100 \
  --json number,title,labels,createdAt,updatedAt,author
```

Show the user the possible blockers before changing the version.

### Secret-name preflight

Check secret names only; never print, download, or commit their values:

```bash
gh secret list -R voyager-crew/voyager --json name --jq '.[].name'
```

Confirm the workflow has names for:

- Safari: `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_APP_PROVISIONING_PROFILE_BASE64`, `APPLE_EXTENSION_PROVISIONING_PROFILE_BASE64`, `SPARKLE_PRIVATE_KEY`
- Firefox: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`
- Chrome: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`
- Edge: `EDGE_CLIENT_ID`, `EDGE_PRODUCT_ID`, `EDGE_API_KEY`

Missing Safari release secrets are blocking: the GitHub Release job now waits for the Safari artifact job.

## 2. Prepare the version and changelog

### Version bump

Read the four current version sources first. If they already match the intended release version after an interrupted attempt, do not bump again; continue with verification and the changelog.

For the next patch version:

```bash
bun run bump
```

For an explicit version:

```bash
bun run bump {VERSION}
```

`scripts/bump-version.js` now updates all four tracked version sources together:

- `package.json`
- `manifest.json`
- `manifest.dev.json`
- `Voyager/Voyager.xcodeproj/project.pbxproj`

Do not manually edit the Xcode project version during a normal release. Verify all values after the bump:

```bash
rg '"version"' package.json manifest.json manifest.dev.json
rg 'MARKETING_VERSION|CURRENT_PROJECT_VERSION' \
  Voyager/Voyager.xcodeproj/project.pbxproj | sort -u
```

### In-product changelog

Create `src/pages/content/changelog/notes/{VERSION}.md`. Read [changelog.md](changelog.md) before authoring it. All 10 locales are required before publication.

Every commit in `PREV_TAG..HEAD` must be accounted for before writing. Scale the effort to the range — do not fan out by default:

- **15 commits or fewer**: read them yourself with `git show <sha> --stat` and the diff where the subject is ambiguous. No subagents. The transcription loss of delegating outweighs the parallelism at this size.
- **More than 15 commits**: still read the range yourself, but delegate the groups where the commit message alone would lead to a wrong conclusion — same-scope clusters containing `fix`, `revert`, or `ux`, where a later commit may cancel, narrow, or quietly exceed an earlier one. **At most 4 agents.** Groups that are purely `ci`, `docs`, `chore`, `build`, `test`, or `refactor` are decided from the commit type; never spend an agent on them.

Whoever does the reading — you or an agent — must establish, per commit: the actual user-facing effect, whether the implementation matches the commit message, and whether it belongs in the changelog. Watch specifically for pairs that net to zero inside the window (a `revert` undoing a `feat`, a `fix` deleting most of the feature it follows) — those are the findings that justify the effort, and they must not reach the changelog.

Write `zh` first, derive `en`, then translate the other eight locales while preserving the required on-disk locale order.

## 3. Verify the final release tree

Finish the version bump, 10-locale changelog, and any release fixes before running the full gates. Run lint first because it can modify files; inspect its diff. Then run the independent checks concurrently:

```bash
bun run lint

bun run typecheck
bun run test
bun run build:all
```

Use `bun run test`, not raw `bun test`. `build:all` writes production outputs to `dist_chrome`, `dist_firefox`, and `dist_safari`; `dist_chrome_dev` is only for routine local Chrome development. Complete any additional checks required by `AGENTS.md` for the changed surfaces.

A successful Chrome build does not cover Firefox's manifest transform/add-on ID or Safari's resource registration. Every top-level `public/` entry must be registered in `Voyager/Voyager.xcodeproj/project.pbxproj`; `build:all` checks that through the Safari build. Keep all three browser builds as the release gate.

Only commit and tag after the gates pass. Record the verified tree; reuse passing results while the relevant inputs remain unchanged. If a later fix, asset, review change, or hook changes tested inputs, rerun the affected checks before tagging or pushing. Build-affecting changes require `build:all` again, not only Chrome. Committing an unchanged verified tree alone does not invalidate evidence.

## 4. Commit and tag locally

Recheck status and HEAD, then stage only the release files:

```bash
git add \
  package.json manifest.json manifest.dev.json \
  Voyager/Voyager.xcodeproj/project.pbxproj \
  src/pages/content/changelog/notes/{VERSION}.md
git diff --cached --name-only
git diff --cached --check
git commit -m "chore(release): v{VERSION}" \
  -m "Co-authored-by: Codex <codex@users.noreply.github.com>"
```

If this release intentionally includes announcements or other release-only files, add them explicitly and re-check the staged list. Never absorb unrelated worktree changes.

Verify the staged list immediately before every commit, not once at the start. A
`git mv` or an earlier `git add` leaves entries in the index, and `git commit`
takes all of them — that is how unrelated work gets absorbed into the release
commit.

Inspect the commit and status with `git show --stat --format=fuller HEAD` and `git status --short --branch -uall`. Verify that the committed inputs match the tested tree, including any hook edits, before creating the local tag:

```bash
git tag "v{VERSION}"
```

## 5. Push the authorized release

Check the concrete tag and commit against the authorization boundaries in [SKILL.md](../SKILL.md). Reuse existing approval; if publication has not been authorized, show the prepared version, verification results, and tag-push effects before asking.

For a release from `main`:

```bash
git push origin main
git push origin "v{VERSION}"
```

If the user chose a different release branch, verify the tag points to that intended branch and push only the authorized branch and tag.

Do not use the workflow's auto-increment `workflow_dispatch` path for a normal curated release: it can bump and tag, but cannot author the required in-product changelog. Reserve it for an already-prepared version or an explicit recovery decision.

## 6. Monitor CI

The tag workflow runs these gates:

1. `build-safari-release` builds `dist_safari`, imports the Developer ID certificate and provisioning profiles, then calls `scripts/build-safari-release.sh`.
2. That script archives the `Voyager` scheme, exports `Voyager.app`, verifies a universal binary, notarizes and staples the app and DMG, includes the Safari-upgrade README, generates signed `appcast.xml`, and scans artifacts for private data.
3. `build-and-release` waits for Safari, builds the other browser artifacts, signs/submits Firefox, creates the GitHub Release, then submits Chrome and Edge.

Monitor with:

```bash
gh run list --workflow release.yml --limit 3
gh run view {RUN_ID} --log-failed
```

For a Safari failure, read [safari-dmg.md](safari-dmg.md). For an isolated store failure, read [store-recovery.md](store-recovery.md).

Important failure semantics:

- Safari build/sign/notarization failure prevents the GitHub Release job from starting.
- A later Chrome or Edge store failure does not undo an already-created GitHub Release or AMO submission.
- Firefox signing can remain quiet for several minutes; wait for an actual error before treating it as stuck.

## 7. Curate the GitHub release body

Read [release-body.md](release-body.md). Use the same commit range as the in-product changelog and replace the generated top section with concise English and Chinese feature/fix tables, preserving the workflow-generated `## 📥 Installation` tail. Verify the rendered body, attribution, and Safari capability text against the current product.

## 8. Verify the published result

Confirm the release contains:

- `voyager-chrome-v{VERSION}.zip`
- `voyager-firefox-v{VERSION}.xpi`
- `voyager-v{VERSION}.dmg`
- `appcast.xml`

```bash
gh release view "v{VERSION}" --json assets --jq '.assets[].name'
```

Also confirm:

- the Safari job reported notarization and privacy verification success,
- `appcast.xml` contains `sparkle:edSignature`,
- Chrome and Edge workflow steps reached upload/submission success,
- AMO signing/submission completed.

Report the release URL, version, verification evidence, and any store review or recovery still pending. Use [store-recovery.md](store-recovery.md) for an isolated submission failure instead of cutting another version.
