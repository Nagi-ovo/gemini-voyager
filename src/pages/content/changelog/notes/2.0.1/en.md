> _"Does this spark joy?" — Marie Kondo, 《The Life-Changing Magic of Tidying Up》_

### Highlights

- 🎛️ **A tidier settings panel**: every optional :gemini: Gemini and :aistudio: AI Studio feature is now one row with one switch, grouped into topic cards: Page layout, Sidebar, Timeline, Answer content, Charts, Export & images, Input and Conversations. Once a feature is on, its options show right under its switch.
- 🔍 **Search that stays put**: the title and search box stay at the top while you scroll, a row of links under the search jumps to each card, and a switch flipped by mistake can be undone at once.

### New

- **Switch off what used to be always on**: Canvas copy as Markdown, the Deep Research export menu, the Markdown rendering fix and batch delete now have their own switches. They stay on by default.
- **:aistudio: AI Studio sidebar width**: has its own switch instead of borrowing Gemini's. Until you set it, it follows the folders switch as before.
- **Visual effects in one place**: snow, sakura and rain share one choice across sites. On Claude, ChatGPT and other sites it sits at the top of that site's plugin card.
- **Visual effects on light pages**: snow, sakura and rain get their own colours on light themes, so they no longer vanish against a white page.
- **Timeline on other sites**: style, levels, Saved Library and message times now live under the timeline row's options, and Saved Library stays reachable with the timeline off.
- **:chatgpt: ChatGPT reply notifications** _(off by default)_: a system notification when a ChatGPT reply finishes.
- **Easier-to-recognise notifications**: they show the Gemini or ChatGPT logo and use the conversation title.
- **Prompt Manager follows the page theme**: the panel matches the site's light or dark theme until you pick one.

### Fixes

- **:gemini: Gemini Canvas copy**: Copy as Markdown is back in Gemini's redesigned Canvas export menu.
- **Fullscreen Canvas**: Voyager's Export button no longer covers Canvas's Collapse button.
- **Export button**: it no longer covers messages scrolled under it, and a second click while waiting for screenshot permission no longer breaks the first export.
- **Backups**: switches you never changed are saved as the page actually uses them, so a restore turns nothing extra on or off.
- **:gemini: Gemini reply notifications**: replies that finish in a background tab now notify, and each reply notifies once.
- **Timeline**: repeated prompts such as "continue" each get their own marker, highlight ticks sit beside their turn, and a star pressed while switching chats no longer lands in the previous one.
- **:gemini: Gemini folders**: Escape closes only the folder menu, the sidebar stays open while you use a folder's menu or rename it, and conversation icons are centred.
- **:chatgpt: ChatGPT sidebar**: rows no longer shift under a double-click after a redraw, the recent order updates again, and Save & continue in a temporary chat no longer gives up when the page loads slowly.
- **Diagrams**: a diagram whose panel is replaced mid-render still draws instead of staying as source.
- **:gemini: Gemini usage bar**: refreshes right after you send a prompt.
- **Visual effects**: turning an effect off or switching to another clears the screen in about two seconds instead of leaving slow flakes drifting for minutes. Effects fall at the same speed on 120 Hz screens, pause while you're in another window, and no longer cover Voyager's own dialogs. On Firefox, sakura on ChatGPT, Claude and DeepSeek starts right away instead of after a 3-second blank.
- **Visual effects row**: on Claude, ChatGPT and other sites, it stays in the settings panel while an effect is still falling, even after that site's last plugin is turned off.
- **Recent Gems in the sidebar**: Gemini's new sidebar moved Gems into the More menu, so this feature has nothing to attach to for now and its row is greyed out.
