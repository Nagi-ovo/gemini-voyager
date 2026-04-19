# CLAUDE.md - Gemini Voyager

## Commands

```bash
bun install                # Setup
bun run dev:chrome         # Dev (also: dev:firefox, dev:safari)
bun run build:chrome       # Build (also: build:firefox, build:safari, build:edge, build:all)
bun run test               # Test (also: test:watch, test:ui, test:coverage)
bun run typecheck          # Type check
bun run lint               # Lint
bun run format             # Format
bun run bump               # Version bump (patch)
bun run docs:dev           # Docs dev server
```

## Core Rules

Path-scoped rules live in `.claude/rules/` and load automatically by glob: `typescript.md` (src/**/*.ts(x)), `content-scripts.md` (src/pages/content/**), `i18n.md` (src/locales/**), `high-complexity.md` (StorageService / DataBackupService / GoogleDriveSyncService / AccountIsolationService / features/folder / features/export).

Project-wide rules (always in effect):

1. **Never modify `dist_*` folders directly.**
2. **Never commit `.env` or secrets.**
3. **When adding Material Symbol icons**, add the icon name to `icon_names=` in the Google Fonts URL in `src/pages/popup/index.html`.
4. **For GitHub issue/PR/comment work, prefer `gh` as the source of truth** instead of browser scraping or unstable connectors.

## Verification (run before declaring done)

1. `bun run typecheck` — after any `.ts`/`.tsx` change
2. `bun run lint` — before finishing
3. `bun run test` — all tests pass
4. `bun run build:chrome` — builds without error
5. New features/fixes must include tests

## Commit Format

Conventional Commits: `<type>(<scope>): <imperative summary>`

- Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `build`, `ci`, `perf`, `style`
- Scope: short, feature-focused (e.g., `copy`, `export`, `popup`)
- Summary: lowercase, imperative, no trailing period
- If the commit relates to a GitHub issue or discussion, include `Closes #xxx` or `Fixes #xxx` in the commit **body**

## Design Principles

1. **KISS.** Implement the minimum interpretation of requirements. Never combine orthogonal features (e.g., "fade" and "thin") without explicit confirmation.
2. **Backward compatibility is iron law.** Zero destructiveness to user data (especially `localStorage`).
3. **Data structures first.** Eliminate special cases by redesigning data, not adding branches.
4. **For visual/CSS changes:** describe expected rendering, verify alignment/centering/spacing in both light and dark themes, and check external resources (icon fonts, CDN links).
5. **For ambiguous requirements:** implement the minimal version first. Ask before adding scope.
6. **Grep for a sibling precedent before adding a new primitive.** Body-level popover, global listener, CSS overlay — there is almost always an existing `gv-pm-*` analogue (e.g., `.gv-pm-confirm` for body-appended popovers) already wired into close-outside handlers, teardown, and theme overrides. Copy its integration points; don't reinvent and miss one.

## Architecture

- **Services**: singletons in `src/core/services/`. `StorageService` is single source of truth for persistence.
- **Content scripts**: `src/pages/content/`. Each sub-module is self-contained.
- **UI**: functional React components + hooks. Business logic in `features/*/services/` or custom hooks, not in UI files.
- **Types**: `src/core/types/common.ts` for StorageKeys and shared types.
- **Translations**: `src/locales/*/messages.json` (10 languages).
- **Injected CSS**: `public/contentStyle.css`.

## Task Map

| Task | Where |
|------|-------|
| Add storage key | `src/core/types/common.ts` → `StorageService.ts` → all 10 locales |
| Update translations | `src/locales/*/messages.json` (all 10) |
| Change DOM injection | `src/pages/content/` |
| Modify popup settings | `src/pages/popup/components/` |
| Fix cloud sync | `src/core/services/GoogleDriveSyncService.ts` |
| Add keyboard shortcut | `src/core/services/KeyboardShortcutService.ts` + types |
