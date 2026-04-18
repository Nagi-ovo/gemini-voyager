# GitHub Release Body Template

## Contents

- Why this exists as a separate artifact from the in-product changelog
- Full template (copy-ready skeleton)
- Generation procedure (collect → filter → write rows → contributors → paste → apply)
- Worked example — v1.3.9

---

This is the body that lands on `https://github.com/Nagi-ovo/gemini-voyager/releases/tag/v{VERSION}`. It's **derivative of the in-product changelog** (`src/pages/content/changelog/notes/{VERSION}.md`) but reformatted for a developer audience:

- Bilingual (English + 简体中文) rather than 10 locales.
- Table format with PR/commit attribution in a third column.
- Skips `zh_TW`, `ja`, `fr`, etc. (those live in the in-product changelog).

## Why this exists as a separate artifact from the in-product changelog

| Audience | File | Format |
|---|---|---|
| End users (in-product) | `src/pages/content/changelog/notes/{VERSION}.md` | 10 locales, bullet lists |
| Developers (GitHub release page) | posted via `gh release edit --notes-file` | en + zh, tables with PR/commit attribution |

The workflow (`.github/workflows/release.yml`) generates a default body on tag push using `gh api releases/generate-notes`. The default has contributor attribution but is **not** the curated bilingual table. After the workflow finishes, overwrite the body with this template.

## Full template

```markdown
## ✨ What's New / 新功能

| Feature | Description | Implemented in |
|---------|-------------|----------------|
| **{Feature Name EN}** {功能名 ZH} | {One-line description EN.} {一句话描述 ZH.} | PR #{NNN} by @{author} · or · direct commit by @Nagi-ovo, closing #{NNN} |
{repeat rows…}

## 🐛 Bug Fixes / 修复

| Fix | Description | Implemented in |
|-----|-------------|----------------|
| **{Fix Name EN}** {修复名 ZH} | {One-line EN.} {一句话 ZH.} | PR #{NNN} by @{author} · or · direct commit by @Nagi-ovo |
{repeat rows…}

## New Contributors

* @{user} made their first contribution in PR #{NNN}
{only include users who have never contributed before — check `gh api generate-notes` output for the list}

---

**Full Changelog**: https://github.com/Nagi-ovo/gemini-voyager/compare/v{PREV_VERSION}...v{VERSION}
```

The `## 📥 Installation` section below this and the Safari block are already appended by the workflow — do not duplicate them.

## Generation procedure

Perform these steps after the tag push completes (see SKILL.md Step 5.5).

### 1. Collect data

```bash
PREV_TAG=$(git describe --tags --abbrev=0 v{VERSION}^)
git log ${PREV_TAG}..v{VERSION} --oneline        # authoritative list of commits for the tables
gh api repos/Nagi-ovo/gemini-voyager/releases/generate-notes \
  -f tag_name=v{VERSION} \
  -f previous_tag_name=${PREV_TAG} \
  --jq '.body'                                    # use ONLY for the New Contributors section
```

**Important:** `generate-notes` has a `"What's Changed"` section that looks like a PR list — **don't use it as your source of truth for the tables**. It filters to external-contributor PRs only; owner (`@Nagi-ovo`) PRs get silently dropped. For v1.4.0, that meant PR #616, #614, #613 (all owner PRs) didn't appear even though they're user-facing features. Always drive the tables from `git log`, where every `feat`/`fix` commit shows up with its `(#NNN)` suffix when applicable. Use `gh pr view <NNN>` to confirm authors.

### 2. Filter commits for the tables

Include:
- `feat(…): …` → **What's New** row
- `fix(…): …` → **Bug Fixes** row

Exclude:
- `chore`, `style`, `refactor`, `ci`, `build` — internal noise
- `docs` — unless the doc change is user-visible (e.g., a new settings guide linked from the product)
- Sponsor/README updates
- Commits that roll back or amend other commits within the same release window

When in doubt, ask: "Would a user care?"

### 3. Write each row

**Feature column** — bold English name, followed by Chinese name with no separator punctuation:
```
| **Pinned timeline preview** 固定时间线预览 |
```

**Description column** — one English sentence, then the Chinese equivalent, period-separated. Keep under ~15 words per language.
```
| Keep the timeline preview panel pinned from the popup. 可在弹窗中将时间线预览面板固定显示。 |
```

**Implemented in column** — one of these forms:
- PR with external contributor: `PR #547 by @chang-xinhai`
- PR by owner: `PR #613 by @Nagi-ovo` (yes, include even if it's the owner — it's traceable)
- Direct commit (no PR): `direct commit by @Nagi-ovo` — add `, closing #NNN` if the commit body referenced an issue

Map commit → PR by scanning commit messages for `(#NNN)` suffixes, or by running `gh pr list --state merged --search "<commit-short-sha>"`.

### 4. New Contributors

Take this section from `gh api generate-notes` output — it correctly identifies first-time contributors across repo history. Don't handwrite it; you'll miss someone.

### 5. Paste together

Combine sections into `release_body.md` in this order (top to bottom):

1. `## ✨ What's New / 新功能` table
2. `## 🐛 Bug Fixes / 修复` table
3. `## New Contributors` (omit entire section if the release has no new contributors — don't leave an empty heading)
4. `**Full Changelog**: …` link
5. ⚠️ Stop here. The workflow already appended the Installation block and Safari block.

### 6. Apply

```bash
gh release edit v{VERSION} --notes-file release_body.md
```

This overwrites the body. The asset list and Installation block are preserved if they live as a separate field — check `gh release view v{VERSION} --json body` immediately after and confirm the Installation section is still present. If it disappeared (because `--notes-file` replaced the entire body, including workflow-appended tail), append the Installation block manually before re-running.

**Safer alternative:** first read the current body, strip sections 1-4 if present (from a previous attempt), prepend the new curated sections, and write back. This preserves whatever the workflow put there:

```bash
CURRENT=$(gh release view v{VERSION} --json body --jq '.body')
# Find the line "## 📥 Installation" and keep from there onward
TAIL=$(echo "$CURRENT" | awk '/^## 📥 Installation/{flag=1} flag')
printf "%s\n\n%s" "$(cat release_body.md)" "$TAIL" > final_body.md
gh release edit v{VERSION} --notes-file final_body.md
```

## Worked example — v1.3.9

Given commits in the v1.3.8..v1.3.9 range:

```
feat: pinned timeline preview (closes #570)
feat(timeline): configurable jump shortcuts (closes #568)
fix(timeline): persist node hierarchy per account
fix(folder): nested folder moves (#547)
fix(firefox): permission request handling (#567)
chore: sponsor update          ← skip
style: prettier                 ← skip
```

Produces:

```markdown
## ✨ What's New / 新功能

| Feature | Description | Implemented in |
|---------|-------------|----------------|
| **Pinned timeline preview** 固定时间线预览 | Keep the timeline preview panel pinned from the popup. 可在弹窗中将时间线预览面板固定显示。 | direct commit by @Nagi-ovo, closing #570 |
| **Configurable timeline jump shortcuts** 时间线跳转快捷键可配置 | Customize the shortcut keys used to jump through the timeline. 可自定义在时间线中跳转使用的快捷键。 | direct commit by @Nagi-ovo, closing #568 |

## 🐛 Bug Fixes / 修复

| Fix | Description | Implemented in |
|-----|-------------|----------------|
| **Experimental node hierarchy** 实验性节点层级 | Timeline node hierarchy state now persists separately for each account. 时间线节点层级状态现在会按不同账号分别持久化保存。 | direct commit by @Nagi-ovo |
| **Nested folder moves** 嵌套文件夹移动 | Moving folders with child folders now works correctly. 现在可以正确移动带有子文件夹的文件夹。 | PR #547 by @chang-xinhai |
| **Firefox permission flow** Firefox 权限流程 | Fixed permission request handling for Firefox. 修复了 Firefox 中的权限请求处理问题。 | PR #567 by @LinJHS |

## New Contributors

* @chang-xinhai made their first contribution in PR #547
* @LinJHS made their first contribution in PR #567

---

**Full Changelog**: https://github.com/Nagi-ovo/gemini-voyager/compare/v1.3.8...v1.3.9
```
