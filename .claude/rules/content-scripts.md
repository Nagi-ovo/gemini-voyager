---
globs: ["src/pages/content/**", "public/contentStyle.css"]
---

# Content Script Rules

## CSS
- All injected CSS classes MUST be prefixed with `gv-` (e.g., `.gv-rtl`, `.gv-pm-trigger`)
- Styles go in `public/contentStyle.css`
- Support both light and dark themes: use `.theme-host.light-theme` / `.theme-host.dark-theme` overrides, NOT `@media (prefers-color-scheme)`
- RTL layout: use `body.gv-rtl` selector for RTL overrides (see `src/core/utils/rtl.ts`)

## Storage
- Content scripts use `chrome.storage` / `browser.storage` directly via ExtGlobal — this is the exception to the "use StorageService" rule
- StorageService is for popup/background/options contexts

## DOM Injection
- Each content script sub-module in `src/pages/content/` is self-contained
- Bridge between Gemini UI and Extension — Gemini DOM structure may change without notice
- Safari has limitations: cloud sync, watermark removal, image export are disabled. Check `isSafari()` guards.
- Extension context can be invalidated after update/reload. Use `isExtensionContextInvalidatedError()`.

## Material Symbols Icons
- When adding new icons in popup, add the icon name to `icon_names=` in the Google Fonts URL in `src/pages/popup/index.html`
