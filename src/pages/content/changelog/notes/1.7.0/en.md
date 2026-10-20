> _"Given enough eyeballs, all bugs are shallow." — Eric S. Raymond, 《The Cathedral and the Bazaar》_

### What's New

- **Insert saved prompts with `/`**: Type `/` in the Gemini composer to search your saved prompts by name, preview one, and drop it in from the keyboard. It now has its own switch, so it keeps working even if you hide the Prompt Manager ball.
- **Name the speakers in your exports**: Replace the default User and AI labels with your own names. The change applies to Markdown, PDF, and image exports, and it's remembered.
- **Use your prompts as Markdown headings** _(off by default)_: Each turn is titled by the question you actually asked instead of a generic turn number.
- **One-click sanitized diagnostics**: The popup can generate a diagnostics report with no conversations, accounts, or links in it — copy it as Markdown or download it as JSON when filing an issue.
- **Reading width now covers Claude artifacts**: Claude · Comfortable Reading Width extends into Claude's document artifact panels. If you already had it on, tap "Grant required site access" in the Plugin Manager once.
- **The popup remembers where you were**: Reopening the popup returns you to the same spot in the settings list instead of snapping back to the top.
- **A proper Safari installer**: The macOS download now opens a designed installer window — drag Voyager to Applications, with the upgrade guide right there.

### Fixes

- **Bookmarks and stars stay on the right message**: The timeline now follows Gemini's own message identities, so reloading a long conversation no longer shifts stars, timestamps, forks, or highlights — and un-starring no longer removes the wrong bookmark.
- **Drive backup folder renamed to Voyager Data**: An existing folder is renamed in place — nothing is moved, copied, or deleted. Voyager now finds it by a hidden marker, so you can rename or move it anywhere in Drive without breaking sync.
- **Prompts with duplicate names survive import and sync**: Same-named prompts are no longer dropped or overwritten when importing or syncing from Drive, and duplicates are flagged so you can rename them.
- **No more blank prompts from the send shortcut**: With Cmd/Ctrl+Enter to send turned on, pressing the shortcut while a file is still uploading no longer fires off an empty prompt — it waits for the upload to finish.
- **Mermaid, all around**: PDF and image exports now contain the rendered diagram instead of its source, diagrams follow Gemini's light or dark theme, they render when Gemini's interface is in Japanese, Korean, Arabic and more, and common syntax slips are repaired automatically.
- **More reliable watermark removal**: Watermarks on dark backgrounds and hard-to-detect ones are now handled, and switching the setting takes effect immediately in Gemini tabs that are already open.
- **Sturdier folders**: A briefly missing sidebar no longer strands you in a floating panel with a button you can't dismiss, and the folder panel no longer appears twice.
- **Usage indicator refreshes again**: A new usage bucket from Gemini no longer causes the whole response to be discarded; the pill updates from any conversation and keeps multi-account scope.
- **And more**: Deep Research report exports are back in the menu, Firefox account isolation no longer stalls, slash prompts follow your accent color, the cloud sync panel shows a clearer platform card, and the Claude usage bar plugin has been retired.
