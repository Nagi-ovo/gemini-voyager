<div align="center">
  <img src="public/icon-128.png" alt="logo"/>
  <h1>Gemini Voyager</h1>
  <h5>A Chrome extension that adds a silky, interactive timeline to your Gemini chats.</h5>
</div>

<p align="center">
  <a href="./README_ZH.md">中文说明</a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol?utm_source=item-share-cb" target="_blank">
    <img alt="Chrome Web Store" src="https://img.shields.io/badge/Install-Chrome%20Web%20Store-4285F4?logo=google-chrome&logoColor=white">
  </a>
</p>

## Intro <a name="intro"></a>

**Gemini Voyager** transforms your experience on `https://gemini.google.com/app` by adding a refined, interactive timeline—mirroring the intuitive flow found in [AI Studio](https://aistudio.google.com/):

<div align="center">
  <img src="public/teaser.png" alt="teaser"/>
</div>

### Timeline

- Your messages are mapped to nodes; click to jump or flow to the message.
- Hover to preview the prompt (3‑line clamp with gradient fade).
- Long‑press to **star** a node; stars sync across tabs. 
- Robust SPA observers keep the active state in sync while you scroll.

### Prompt Manager

- Save and reuse prompts with tags; instant search and one‑click copy
- Import/export your prompts as JSON
- Compact floating panel anchored to the trigger with optional lock; works on Gemini and AI Studio

### Export Chat History

- Click the small export icon next to the Gemini logo to download the current page's chat as JSON.
- The exported file uses the format `gemini-voyager.chat.v1` and includes:
  - `url`, `exportedAt`, `count`
  - `items`: ordered pairs of `{ user, assistant, starred }`
    - `starred` mirrors your timeline stars for each user turn
    - The assistant text excludes the on-page reasoning toggle labels (e.g., "Show thinking", "显示思路")

Example payload shape:

```json
{
  "format": "gemini-voyager.chat.v1",
  "url": "https://gemini.google.com/app/...",
  "exportedAt": "2025-01-01T12:34:56.000Z",
  "count": 3,
  "items": [
    { "user": "...", "assistant": "...", "starred": true }
  ]
}
```

## TODOs <a name="todos"></a>

- [x] Support prompt management
- [x] Support exporting current chat history
- [ ] TBD...

## Getting Started <a name="gettingStarted"></a>

Supported browsers: Chrome, Edge (Chromium), Opera (Chromium), Firefox.

### Install from Browser Stores (Recommended)

- Chrome / Edge / Opera: Install from the Chrome Web Store: [Open listing](<!-- REPLACE_WITH_CHROME_WEB_STORE_URL -->)
- Firefox: Install from Firefox Add-ons: [Open listing](<!-- REPLACE_WITH_FIREFOX_ADDONS_URL -->)

### Manual install (ZIP)

If you prefer manual installation:

#### Load your extension (Chromium: Chrome / Edge / Opera)

1. Go to the [repository Releases page](https://github.com/Nagi-ovo/gemini-voyager/releases) and download the latest archive named like `gemini-voyager-chrome-vX.Y.Z.zip`.
2. Unzip it to a folder (you will see `manifest.json` at the root).
3. Open your extensions page and enable Developer mode:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Opera: `opera://extensions`
4. Click “Load unpacked”.
5. Select the unzipped folder (e.g. `Gemini Voyager vX.Y.Z`).

#### Load your extension (Firefox)

1. Go to the repository Releases page and download `gemini-voyager-firefox-vX.Y.Z.zip`.
2. Unzip it.
3. Open `about:debugging#/runtime/this-firefox` in Firefox.
4. Click “Load Temporary Add-on…”.
5. Select the `manifest.json` inside the unzipped folder.

### Develop (recommended with Bun)

```bash
bun i
# Chrome dev
bun run dev:chrome
# Firefox dev
bun run dev:firefox
```

or `pnpm`:

```bash
pnpm install
# Chrome dev
pnpm run dev:chrome
# Firefox dev
pnpm run dev:firefox
```

## References
Inspired by “[ChatGPT Conversation Timeline](https://github.com/Reborn14/chatgpt-conversation-timeline)”. We adapted timeline mapping and observer patterns for Gemini and extended the UI/UX.


## Contributing <a name="contributing"></a>
We welcome all pull requests and issue reports!  

For development guidelines and best practices, please refer to [CONTRIBUTING.md](./CONTRIBUTING.md).

Before submitting an issue, please review our [bug report template](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/bug_report.md) and [feature request template](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/feat_request.md) to help us address your feedback efficiently.

Thank you for helping improve **Gemini Voyager**!