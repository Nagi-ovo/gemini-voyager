### What's New

- **Official plugin marketplace & contribution guide**: Voyager now ships with a built-in plugin marketplace. Anyone can publish a plugin via a simple [contribution guide](https://voyager.nagi.fun/guide/plugin-contribution) — start with a declarative CSS + JSON plugin, no extension build required. See it in action at the [Plugin Store](https://voyager.nagi.fun/plugins).
- **Builtin Formula Copy plugin** *(opt-in, off by default)*: A new first-party "Formula Copy" plugin ships in the extension — but it stays **off** until you turn it on. Just open the popup's Plugins section, flip the toggle for Claude or ChatGPT, and the browser will show a one-time permission prompt to grant Voyager host access for that site. Click the formula on the page and it's copied as Markdown LaTeX. Nothing activates silently and the prompt is the only "configuration" step.
- **Localized plugin metadata**: Plugin name and description now follow your popup language; marketplace cards on the docs site do too.

### Fixes

- **Watermark anchor moved by Gemini**: Re-adapted the watermark remover to Gemini's new anchor position — the high-failure report from 1.4.7 is resolved.
- **Watermark full teardown**: `stopWatermarkRemover` now releases every observer, timer, and listener it created, so toggling off can't leave a stuck "processing" state.
- **Sidebar toggle hit target**: Restored the widened hit area on the collapsed-sidebar toggle that was reverted in the last release.
- **Folder menu titles on native drag**: Folder drag titles now match Gemini's native style, so they look right inside AI Studio and the recent-history hover.
- **Folder picker opens upward**: The folder project picker now opens above the trigger when there's no room below.
- **Folder: "Remove from folder" wording**: Confirmation copy is clearer — you're removing the conversation from the folder, not deleting the folder.
- **Timeline tooltip activation**: Tooltips now wait for an explicit hover instead of flashing on every scroll.
- **Firefox optional-host-permissions gate**: Users on Firefox 116+ can now grant optional permissions again (regression from the Fx<128 fix).
- **Safari durable backup recovery**: Backup recovery now persists to durable storage so the ITP 7-day window doesn't drop folder backups.
- **Formula copy toast language**: The copy-success toast now matches the selected UI language, not the browser locale.
- **A11y wiring**: Sliders, switches, and ratings now have proper aria labels, and `eslint-plugin-jsx-a11y` is enforced in CI.

### Performance

- **Lazy KaTeX + JSZip**: KaTeX and JSZIP no longer load in the content-script bundle — they only load when first needed (math preview, image export).
- **Deferred marked + KaTeX in prompt preview**: The prompt markdown preview no longer parses math at popup open time.
- **Idle watermark init**: Watermark observer initialization yields to `requestIdleCallback` so first paint stays smooth.
- **Account-isolation skip**: No-op profile-map rewrites are now skipped instead of re-running on every change.
