> *"You meet the one you meet amongst thousands and tens of thousands of people, amidst thousands and tens of thousands of years, in the boundless wilderness of time — not a step sooner, not a step later." — Eileen Chang*

### What's New

- **Real message timestamps**: The timeline now shows the actual time Gemini recorded on its servers, not just when your device first saw the message — fixing wrong or missing times when browsing history from another device.
- **Easier Prompt Manager discovery on ChatGPT/Claude**: A toolbar dot and an "Enable on this site" toggle in the popup point you to the Prompt Manager, and the import/export/cloud-sync panel now works directly on those sites too.
- **Prompts-only cloud sync**: New "Pull (merge)" / "Push (merge)" buttons sync just your prompt library to Google Drive, merging both sides non-destructively.

### Fixes

- **Claude timeline jitter**: Fixed the timeline growing/shrinking during scroll and stars/the active marker landing on the wrong turn, caused by Claude's virtualized conversation DOM.
- **Default model auto-apply**: Fixed occasional flicker, double-starred rows, and stolen input focus when auto-applying your default model or thinking level.
- **Gems sidebar**: Fixed the sidebar showing another account's cached Gems after switching accounts.
- **Folder stability**: Fixed a batch of issues including occasional message-send hangs and duplicate re-renders.
- **Sidebar collapse button**: Fixed the collapse button sometimes not responding to clicks after resizing the sidebar.
- **Folder recency sort**: Fixed unstable ordering in the recently-used conversation list.
- **Claude usage bar**: Fixed the bar occasionally reappearing on its own after being disabled.
- **Popup cloud-sync icons**: Now match the style used in the folder panel.
- **Prompt import/export**: Restored the import/export controls that were missing from the main settings panel.
