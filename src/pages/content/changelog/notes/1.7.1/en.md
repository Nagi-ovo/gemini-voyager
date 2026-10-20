> _"Attention is all you need." — Vaswani et al., 《Attention Is All You Need》(2017)_

### What's New

- **Ruler timeline** _(off by default)_: A third timeline style whose ticks swell around where you're reading, with a hover preview of the question and the answer. Switch to it under Timeline Style in the popup.
- **Activity view** _(off by default)_: Click the bell beside Folders in the Gemini sidebar to swap the folder tree for a time-ordered list — Priority (a new reply in the last 3 hours), Today, Yesterday — so you can see what to pick up next. [→ Docs](/guide/activity-view) ![Activity view](https://github.com/voyager-crew/voyager/raw/main/docs/public/assets/promotion/Activity-View.png)
- **Prompt Manager on sites with a port**: Add self-hosted chat sites such as `localhost:3000` as custom websites.
- **Sidebar width from the folder menu** _(off by default)_: Adjust the sidebar width right where you are instead of opening the popup.
- **Settings search remembers your last query**: Reopening the popup restores what you last typed into the search box.

### Fixes

- **Timeline navigation stops going dead**: After Gemini rebuilds its chat scroll area, the timeline dots, the preview list, and the `j`/`k` shortcuts keep jumping to the right message.
- **Compact preview survives the hover gap**: Moving the pointer from the rail across to the preview panel no longer closes it, so the items inside are clickable again.
- **Header buttons are clickable again**: With Chat Width on, an invisible hitbox around the Gemini logo no longer blocks the close-sidebar, temporary-chat, and other header buttons.
- **File-drop overlay matches your input width**: The blue drop area now spans the widened composer instead of stopping at Gemini's default width.
- **Formula Copy works on ChatGPT again**: ChatGPT changed how it renders formulas, which left the copy action doing nothing; block formulas now get the right delimiters too. Plugins that stayed dead in Edge after you granted site access now activate right away.
- **More watermarks removed**: More full-size Gemini images come out clean, and the 🍌 badge appears as soon as a download button is there instead of waiting for the engine to finish loading.
- **A warning when Google returns a broken image**: If the original you download doesn't match the preview on screen — blurred or cut off — Voyager now tells you, and makes clear it wasn't the cause.
- **And more**: The settings search box no longer shows two clear buttons, the update badge preference moved into General Options where search can find it, the Claude guide no longer covers an open artifact, and the Folders hide switch is gone — anything you had hidden comes back collapsed.
