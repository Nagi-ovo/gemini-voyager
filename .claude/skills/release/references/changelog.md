# In-Product Changelog Template (10 locales)

## Contents

- Locale order (exact 10 required)
- Section headers per locale
- Commit → entry filtering rules
- Style guide
- Closing gift line (classic-anime quote) — required
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

## Closing gift line (classic-anime quote) — required

Every release ends each locale with a small gift: a thematic break, then one blockquoted, italic line — **a quote from a classic anime**. It's a present for the reader, not a changelog entry. (Introduced in v1.5.1, which used a 苏轼 couplet; from v1.5.2 onward the standard is a classic-anime line.)

Format — after the last `### Fixes` bullet, in **every** locale:

```markdown
---

> *"{the quote}" — {Character}, 《{Anime Title}》*
```

**Source it with WebSearch every release** — don't pull from memory (you'll misquote or repeat). Each release:

1. **WebSearch** for a fitting line, e.g. `classic anime quotes about hope / kindness / moving forward`, or search within a specific classic series. Skim a few results.
2. **Verify it's real**: confirm the wording, the character, and the anime via the search results — not an aggregator's paraphrase. Get the attribution right.
3. **Confirm it's classic & pre-2026**: the anime must have aired/released **before 2026** and be genuinely well-known (e.g. *Naruto, One Piece, Fullmetal Alchemist, Mushishi, Violet Evergarden, Vinland Saga, Frieren, Your Name*…). No obscure or post-2025 titles.
4. **Confirm it's fresh**: `grep -rh '^>' src/pages/content/changelog/notes/` and make sure neither the line nor the anime has shipped in a prior release.

Rules:
- **Tone — gentle, warm, and quietly hopeful; it should land like a soft exhale.** Pick a line that leaves the reader a little lighter — kind, tender, a touch beautiful. Steer firmly clear of the preachy and the motivational: no life lessons, no grand "work hard / never give up" declarations, no moralizing. Calm over loud, tender over triumphant. Journey/voyage themes suit the product name especially well.
- **One quote per release, rendered natively in all 10 locales.** Use the line's *official/known* translation per language where one exists; otherwise translate naturally (never machine-literal). Keep the character + 《title》 attribution in each.
- Renders fine in the viewer: `blockquote`, `em`, and `hr` are on the sanitizer allow-list in `src/pages/content/changelog/index.ts` — don't introduce other raw HTML.
- The line sits at the *bottom* of each locale's body (the notes file can't touch the popup's version badge; this is the gift "for this version").
- Optional, rare: this line may *softly* point readers to another of the maintainer's projects — same gentle, non-ad register (a tasteful nudge, never a banner). Not every release.

## Template skeleton

```markdown
<!-- lang:en -->

### What's New

- **{Title}**: {Description.}
- **{Title}** *(off by default)*: {Description.} [→ Docs](/guide/{slug})

### Fixes

- **{Title}**: {Description.}

---

> *"{quote}" — {Character}, 《{Anime Title}》*

<!-- lang:zh -->

### 新功能

- **{中文标题}**：{中文描述。}
- **{中文标题}** *（默认关闭）*：{中文描述。}[→ 文档](/guide/{slug})

### 修复

- **{中文标题}**：{中文描述。}

---

> *"{台词}" —— {角色}，《{动漫名}》*

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

Fill every locale — all 10 are non-negotiable, including the closing gift line. Write **Chinese first**, render English from it, then the other 8 from English (see *Authoring order* below).

## Authoring order — Chinese first

**Write and polish Chinese (`zh`) first.** It's the project's primary voice and the maintainer's native language — the notes read most naturally when zh is the *source*, not a back-translation. Then:

- Render **English (`en`)** from the polished zh. `en` must always be complete: the in-product viewer falls back to `en` for any locale it can't find, so it stays the safety net even though it's no longer the source.
- Translate the remaining **8 locales from the English** (`en` is a cleaner pivot than zh for non-CJK languages). Keep the same structure — bullets, bold titles, optional-feature markers, and the closing gift line (see below). Use punctuation native to each language (`：` in Chinese/Japanese, `:` in others).
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
- The closing gift line is present in all 10 locales, is a **real, verified classic-anime quote** (sourced via WebSearch this release), is **new vs. every prior release**, and fits the gentle/warm/unpreachy tone.
