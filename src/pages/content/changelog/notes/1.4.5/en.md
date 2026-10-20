**Important update — please skim before dismissing.** Gemini's web UI just shipped a major redesign, and this release rebuilds the entire extension for the new layout (sidebar, model picker, folder panel, Gems entry) so your existing setup keeps working. The fixes below address real reports from the past 24 hours — if anything's still broken for you, expect a quick follow-up.

### What's New

- **Recent Gems sidebar list**: Expand the native Gems entry in the sidebar into a list of your recent gems for one-click access.
- **Thinking-level lock**: The default-model setting now also remembers and re-applies your preferred thinking level (Standard / Extended).
- **Input box halo toggle** *(off by default)*: Hide the blue radial-gradient glow behind Gemini's chat input area.
- **Markdown upload fork**: Start a new fork by uploading a markdown file — its content is prefilled into the new prompt as context.
- **Folder toolbar settings**: Floating folder-panel settings now live in its toolbar, with a cloud-sync popover and automatic floating-mode fallback.
- **Notebooks/Recents hide controls**: Corner buttons to hide Notebooks and Recents are back, plus a new corner-swap toggle to switch which section the folder panel anchors above.

### Fixes

- **Gemini 2026 model picker**: The default-model lock recognizes the redesigned model picker overlay so the menu stops flickering open and closed.
- **Sidebar auto-hide on Gemini 2026**: Auto-hide now finds the redesigned collapse button instead of bailing out.
- **Folder panel placement**: Folder panel reliably stays above Recents through Gemini's re-renders.
- **Collapsed-sidebar leak**: Our gems list and folder UI no longer protrude past the collapsed sidebar rail.
- **Keyboard shortcuts vs IME**: Shortcuts no longer fire during IME composition or inside editable inputs.
- **Cloud sync overwrite safety**: Cloud overwrite is blocked when no local folder backup exists yet.
- **Markdown-upload fork prefill**: Uploading a markdown file in the fork flow correctly prefills the context prompt.
