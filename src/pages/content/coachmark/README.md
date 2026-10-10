# Coachmarks

Read this when adding or changing a guide or its lifecycle.

- Reuse the primitives in this directory; keep each consumer beside its feature.
- Register Gemini guides in `showOnboardingCoachmarksWhenChangelogIsIdle` in `src/pages/content/index.tsx`.
- A plugin-site guide starts from its plugin's own lifecycle instead, such as `src/features/plugins/builtin/chatgptFolders/chatgptFolderGuide.ts`. Those sites have no `body.gv-rtl`, so pass `rtl`, and pass a `signal` that aborts when the plugin scope is disposed.
- Each guide needs a stable ID, side-effect-free eligibility, cleanup after partial mount failure, all 10 locales, a debug trigger and tests.
- Skip seen or ineligible guides. Show the remaining guides continuously in registration order with `1/N` progress.
- Confirmation advances the tour; close, Escape or an outside click exits it.
