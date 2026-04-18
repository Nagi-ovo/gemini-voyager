# In-Product Changelog Template (10 locales)

## Contents

- Locale order (exact 10 required)
- Section headers per locale
- Commit → entry filtering rules
- Style guide
- Template skeleton (copy-ready)
- Translation approach
- Reality check before saving

---

This file lives at `src/pages/content/changelog/notes/{VERSION}.md` and is **shown to end users in-product**. It is separate from the GitHub release body (see `release-body.md`).

## Locale order (must be exactly these 10)

`en` → `zh` → `zh_TW` → `ja` → `fr` → `es` → `pt` → `ar` → `ko` → `ru`

This order matches the project's i18n convention. Use `<!-- lang:xx -->` as the delimiter for each section — the in-product viewer parses these tags.

## Section headers per locale

| Locale | "What's New" | "Fixes" |
|---|---|---|
| en | `### What's New` | `### Fixes` |
| zh | `### 新功能` | `### 修复` |
| zh_TW | `### 新功能` | `### 修復` |
| ja | `### 新機能` | `### 修正` |
| fr | `### Nouveautés` | `### Corrections` |
| es | `### Novedades` | `### Correcciones` |
| pt | `### Novidades` | `### Correções` |
| ar | `### الجديد` | `### الإصلاحات` |
| ko | `### 새로운 기능` | `### 수정` |
| ru | `### Новое` | `### Исправления` |

Recent notes (e.g., `1.3.0.md` for a bigger release with a `### Highlights` section) may use different headers. Match the pattern of the immediately prior release unless you have reason to deviate.

## Commit → entry filtering

Include:
- `feat(scope): …` — user-visible new feature
- `fix(scope): …` — user-visible bug fix
- `perf(scope): …` — if the speedup is noticeable to users

Exclude:
- `chore`, `style`, `refactor`, `ci`, `build`, `test` — internal
- `docs` — unless it's a brand-new user-facing guide page the user would care about
- Sponsor updates, README updates, version bumps
- Revert/fix-forward commits that cancel out within the same window

Rule of thumb: if a user couldn't see or feel the change, skip it.

## Style guide

- Lead each entry with a **bold title** followed by a colon and the description.
- Titles should be short and product-like ("Sidebar auto-hide", not "Implement sidebar auto-hide functionality").
- Descriptions are one line. If you need two lines, the entry is probably two separate features — split them.
- For optional features, add `*(off by default)*` / `*（默认关闭）*` after the title so users know they need to turn it on.
- Link to docs sparingly: `[→ Docs](/guide/{slug})` only when the doc genuinely helps. Don't link to a stub.
- Translations should feel native. Arabic is RTL — don't worry about it in the raw file (the viewer handles direction), just get the text right.

## Template skeleton

```markdown
<!-- lang:en -->

### What's New

- **{Title}**: {Description.}
- **{Title}** *(off by default)*: {Description.} [→ Docs](/guide/{slug})

### Fixes

- **{Title}**: {Description.}

<!-- lang:zh -->

### 新功能

- **{中文标题}**：{中文描述。}
- **{中文标题}** *（默认关闭）*：{中文描述。}[→ 文档](/guide/{slug})

### 修复

- **{中文标题}**：{中文描述。}

<!-- lang:zh_TW -->

### 新功能

- ...

<!-- lang:ja -->

### 新機能

- ...

<!-- lang:fr -->

### Nouveautés

- ...

<!-- lang:es -->

### Novedades

- ...

<!-- lang:pt -->

### Novidades

- ...

<!-- lang:ar -->

### الجديد

- ...

<!-- lang:ko -->

### 새로운 기능

- ...

<!-- lang:ru -->

### Новое

- ...
```

Fill every locale — all 10 are non-negotiable. Writing English first and translating from it is the most reliable workflow.

## Translation approach

- Write the English version first, polishing the phrasing until it's tight and product-voiced.
- Translate to Chinese (`zh`) next — the second most important language for this project. Keep titles crisp; long Chinese phrasings ruin the list layout.
- For the remaining 8 locales, translate from the English. Maintain the same structure (bullets, bold titles, optional-feature markers). Use romanization conventions and punctuation native to each language (e.g., `：` in Chinese, `：` in Japanese, `:` in others).
- Arabic: RTL concerns are handled by the viewer — write natural RTL text; don't reorder for LTR display. Double-check that punctuation marks (commas, colons) are Arabic-style where applicable.
- Read prior releases in the same locale before writing — there's an established voice per language.

## Reality check before saving

- Every locale has the same number of bullets in the same order.
- Every `<!-- lang:xx -->` tag is present.
- No locale is missing a section that another locale has.
- Optional-feature markers are present in all 10 where they appear in English.
- No commit-speak leaked in (avoid things like "implement X" or "refactor Y to be more Z" — those are internal descriptions).
