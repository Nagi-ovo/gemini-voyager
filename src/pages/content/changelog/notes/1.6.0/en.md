> *"Not all those who wander are lost." — J. R. R. Tolkien, The Fellowship of the Ring*

### What's New

- **Safari gains native macOS capabilities — and the app is renamed to Voyager**: The direct-download Safari build now connects its WebExtension to native Google Drive and iCloud sync, macOS response-finished notifications that open the right conversation, and—after this one-time migration—future updates through Sparkle. Image export and watermark removal work again, and iCloud backups can be deleted from the popup without touching local data. The host app has been renamed from "Gemini Voyager" to "Voyager". ⚠️ **If you're upgrading, follow the migration guide once before updating so you don't end up with two apps installed.**
- **Vim input mode comes to Claude and ChatGPT**: The message box now supports Vim-style keyboard editing beyond Gemini.
- **Collapsible long code blocks**: Overly long code blocks can be collapsed with a button so they no longer fill the screen while you scroll.
- **Folder-only search**: Type an `f:` (or `folder:`) prefix in search to match folder names only, with a badge showing when folder search is active.
- **Uploaded files noted in exports**: Exporting a conversation now lists the non-image files you attached (by name), so that context isn't lost.
- **Choose how release notes appear**: Let Voyager open what's new automatically after an update, or show only a `NEW` badge until you open it.

### Fixes

- **Smarter, broader watermark removal**: Handles Gemini's latest watermark variants and more logo sizes (including small and downscaled images), succeeds on more borderline cases, and still only runs when a watermark is actually detected. Notebook (NotebookLM) pages are no longer disturbed, Safari again downloads the full-size watermark-free image, and failed removals fall back to a normal download.
- **More reliable usage indicator**: Works consistently on Chromium browsers (Chrome / Edge), no longer flickers to a wrong lower number from stale data, keeps the reset countdown after a refresh, and shows a clickable load prompt when no data is present.
- **Sturdier folders**: Folder assignments survive Gemini's sidebar scrolling (virtualization), clicking a conversation opens the right one, renaming uses Gemini's native dialog and stays in sync, and imports no longer break under contention.
- **Drafts stay with their conversation**: An unsent draft stays in the conversation you typed it in and won't be overwritten when you switch chats.
- **Onboarding tour no longer exits by accident**: Clicking back into the page during the tour no longer ends it — only an explicit close or Escape does.
- **Highlight is now opt-in**: If you never used Highlight, it now starts off (existing highlights stay on and your data is unchanged).
- **Performance and more**: Faster feature startup and lower memory in long conversations, popup settings scroll right away, fullscreen Mermaid cleans up on close, the timeline preview stays in view, export handles lazy-loaded messages, plugin validation blocks remote and script-scheme URLs, and multi-account isolation is sturdier.
