<div align="center">
  <img src="public/icon-128.png" alt="logo"/>
  <h1>Gemini Voyager</h1>
  <h5>A Chrome extension that adds a silky, interactive timeline to your Gemini chats.</h5>
</div>

## Intro <a name="intro"></a>

**Gemini Voyager** enhances `https://gemini.google.com/app` with a compact, elegant timeline:

- Your messages are mapped to dots; click to jump or flow to the message.
- Hover to preview the prompt (3‑line clamp with gradient fade).
- Long‑press to star a dot; stars sync across tabs.
- Robust SPA observers keep the active state in sync while you scroll.


## Getting Started <a name="gettingStarted"></a>

### Load your extension (Chrome)

1. Go to the repository Releases page and download the latest archive named like `gemini-voyager-chrome-vX.Y.Z.zip`.
2. Unzip it to a folder (you will see `manifest.json` at the root).
3. Open [chrome://extensions](chrome://extensions) and enable Developer mode.
4. Click “Load unpacked”.
5. Select the unzipped folder (e.g. `Gemini Voyager vX.Y.Z`).

Note: Edge (Chromium) can also load the unzipped folder as an unpacked extension, but this project primarily targets Chrome.

### Load your extension (Firefox)

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

## References
Inspired by “[ChatGPT Conversation Timeline](https://github.com/Reborn14/chatgpt-conversation-timeline)”. We adapted timeline mapping and observer patterns for Gemini and extended the UI/UX.


## Contributing <a name="contributing"></a>
We welcome all pull requests and issue reports!  

For development guidelines and best practices, please refer to [CONTRIBUTING.md](./CONTRIBUTING.md).

Before submitting an issue, please review our [bug report template](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/bug_report.md) and [feature request template](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/feat_request.md) to help us address your feedback efficiently.

Thank you for helping improve **Gemini Voyager**!