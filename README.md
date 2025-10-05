<div align="center">
  <img src="public/icon-128.png" alt="logo"/>
  <h1>Gemini Voyager</h1>
  <h5>A Chrome extension that adds a silky, interactive timeline to your Gemini chats.</h5>
</div>

<p align="center">
  <a href="./README_ZH.md">中文说明</a>
</p>

## Intro <a name="intro"></a>

**Gemini Voyager** transforms your experience on `https://gemini.google.com/app` by adding a refined, interactive timeline—mirroring the intuitive flow found in [AI Studio](https://aistudio.google.com/):

<div align="center">
  <img src="public/teaser.png" alt="teaser"/>
</div>

- Your messages are mapped to nodes; click to jump or flow to the message.
- Hover to preview the prompt (3‑line clamp with gradient fade).
- Long‑press to **star** a node; stars sync across tabs. 
- Robust SPA observers keep the active state in sync while you scroll.


## Getting Started <a name="gettingStarted"></a>

### Load your extension (Chrome)

1. Go to the [repository Releases page](https://github.com/Nagi-ovo/gemini-voyager/releases) and download the latest archive named like `gemini-voyager-chrome-vX.Y.Z.zip`.
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