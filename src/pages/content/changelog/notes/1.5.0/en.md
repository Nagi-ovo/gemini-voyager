### What's New

- **Usage status bar** *(off by default)*: Show Gemini daily and weekly usage near the composer, with a one-time intro and silent refreshes after responses.
- **Remote Voyager notices**: Voyager reads a public JSON feed as data only (title, body, HTTPS link) and shows it locally; the feed cannot inject or run remote code.
- **Edge Add-ons support continues**: Voyager will keep maintaining the Microsoft Edge Add-ons build for users who need Edge on mobile or tablet.
- **Light-mode code blocks**: Gemini code blocks now follow the page theme, so light pages no longer get a glaring dark code surface.
- **YouTube covers in exports**: Exported conversations now keep YouTube video covers as clickable images.

### Fixes

- **Folders on the new Gemini sidebar**: Restored folders after Gemini moved its sidebar state to a new shell element.
- **Faster sidebar opening**: Large chat histories no longer trigger the worst per-row sidebar scans, especially noticeable in Firefox.
- **Export toolbar placement**: The persistent export toolbar appears immediately on the new logoless UI and stays in the top-right control area.
- **Firefox notification updates**: Notification permission is optional again, so Firefox updates no longer get stuck behind a required-permission prompt.
- **Multi-account gem links**: Sidebar gem links now keep the current Gemini account window instead of reusing another tab's `/u/N` path.
- **Conversation restore scrolling**: Voyager no longer blocks Gemini's own scroll restoration when reopening or switching conversations.
- **Default model switching**: Rejected auto-switches and selector flashes are guarded more tightly.
- **Stacked watermarks**: Watermark removal repeats when images contain multiple stacked marks.
