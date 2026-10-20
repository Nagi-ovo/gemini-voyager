> _"You're gonna need a bigger boat." — Brody, 《Jaws》 (1975)_

### Highlights

- 🗂️ **:claude: :deepseek: Folders on Claude and DeepSeek** _(off by default)_: turn on **Claude · Folders** or **DeepSeek · Folders** under Plugins to file chats into folders in the sidebar, as on ChatGPT.
- 🎨 **A quieter, unified look**: the popup, Prompt Manager, export, timeline, highlights, folders and the other panels now share one calmer style that follows each site's light or dark theme, and the Voyager name is drawn as a new wordmark.
- ✅ **:chatgpt: Local Bridge answers ChatGPT's approval card**: when ChatGPT asks to allow Google Drive or another app, Voyager CLI's `--approve-apps` lets the extension click it for you (CLI 0.4.0 or later).

### New

- **:chatgpt: Local Bridge saves reply files**: files a ChatGPT reply offers are saved next to the reply by Voyager CLI (CLI 0.3.0 or later).
- **Exact numbers in settings**: settings with a wide range get a number box beside the slider, so you can type the exact value.

### Fixes

- **:gemini: Exporting very long chats**: a very long Gemini conversation no longer fails to export; Voyager exports the part that has loaded and says that only the most recent part is included.
- **:gemini: Selecting replies to export**: Gemini replies show their checkbox again, it no longer covers the first words, and all checkboxes line up in one column.
- **:gemini: Folders above Notebooks**: after Gemini's sidebar change, folders can again be placed above Notebooks or above your chats.
- **:chatgpt: ChatGPT export button**: the header export button lines up with Share and no longer covers it while a dialog is open.
- **:chatgpt: ChatGPT Local Bridge**: a failed send takes its prompt back out of the input box instead of leaving a draft, a prompt with a Google Drive link sends normally, and a reply cut short by a dropped connection is no longer saved as the answer.
- **Folder details**: the folder arrow no longer turns into a dash, all seven colors fit on one row, sort options wrap in a narrow settings menu, and DeepSeek's select-chats button is no longer covered.
- **Prompt Manager after an update**: updating or reloading the extension no longer leaves the Prompt Manager's button and panel behind on the page.
