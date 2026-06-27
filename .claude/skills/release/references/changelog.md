# In-Product Changelog Template (10 locales)

## Contents

- Locale order (exact 10 required)
- Section headers per locale
- Commit → entry filtering rules
- Style guide
- Optional closing note
- Template skeleton (copy-ready)
- Authoring order — Chinese first
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

## Optional closing note

Do **not** force a decorative quote into every release. Changelog notes are product communication first; a closing note is optional and should be omitted unless it genuinely fits the release.

Use a closing note only when it passes all of these checks:

- **Direct fit**: it matches the release theme without explanation. For security, privacy, or permission releases, the line should be about responsibility, restraint, trust, or care — not just something vaguely warm.
- **High recognition**: a casual fan or general reader is likely to recognize the line or at least the source. Prefer iconic lines, not quiet one-off dialogue from a minor scene.
- **Source confidence**: the wording and attribution can be verified from a reliable source. Avoid fan quote lists unless a better source confirms it.
- **Tone fit**: it should feel like a small closing wink or reflection, not a motivational poster, sermon, ad, or inside joke.
- **Localization fit**: it can be translated naturally in all 10 locales without getting awkward.

Before writing it into the changelog, collect 3–5 candidates in scratch notes and reject anything that:

- needs an explanation to connect to the release
- is only "valid" because WebSearch found it
- comes from an obscure source or an obscure moment in a famous source
- was chosen mainly because previous releases have not used it
- feels more clever than useful

Prefer no quote over an obscure or merely searchable quote.

If you add one, use a thematic break followed by one blockquoted, italic line in every locale:

```markdown
---

> *"{the quote}" — {Character}, 《{Work Title}》*
```

When a closing note is used:

- Verify it with WebSearch or another reliable source. Do not rely on memory, fan quote lists alone, or aggregator paraphrases.
- Confirm it has not been used before with `grep -rh '^>' src/pages/content/changelog/notes/`.
- Use one line across all 10 locales. Use official/known translations where they exist; otherwise translate naturally.
- Renders fine in the viewer: `blockquote`, `em`, and `hr` are on the sanitizer allow-list in `src/pages/content/changelog/index.ts` — don't introduce other raw HTML.
- The line sits at the bottom of each locale's body.

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

Fill every locale — all 10 are non-negotiable. Write **Chinese first**, render English from it, then the other 8 from English (see *Authoring order* below).

## Authoring order — Chinese first

**Write and polish Chinese (`zh`) first.** It's the project's primary voice and the maintainer's native language — the notes read most naturally when zh is the *source*, not a back-translation. Then:

- Render **English (`en`)** from the polished zh. `en` must always be complete: the in-product viewer falls back to `en` for any locale it can't find, so it stays the safety net even though it's no longer the source.
- Translate the remaining **8 locales from the English** (`en` is a cleaner pivot than zh for non-CJK languages). Keep the same structure — bullets, bold titles, and optional-feature markers. Use punctuation native to each language (`：` in Chinese/Japanese, `:` in others).
- Keep titles crisp in every language; long phrasings (especially zh) wreck the single-line list layout.
- Arabic: RTL is handled by the viewer — write natural RTL text, don't reorder for LTR display; use Arabic-style punctuation.
- Read the prior release in the same locale before writing — there's an established voice per language.

**Do not reorder the file.** The `<!-- lang:xx -->` section order stays `en → zh → zh_TW → …` (the viewer parses in that order and `en` is the fallback). Only the *writing* order is zh-first — the sections on disk keep en first.

## Reality check before saving

- Every locale has the same number of bullets in the same order.
- Every `<!-- lang:xx -->` tag is present.
- No locale is missing a section that another locale has.
- Optional-feature markers are present in all 10 where they appear in English.
- No commit-speak leaked in (avoid things like "implement X" or "refactor Y to be more Z" — those are internal descriptions).
- If an optional closing note is present, it appears in all 10 locales, is verified, is new vs. prior release notes, and clearly fits the release. If it feels decorative or obscure, remove it.
