<div align="center">
  <img src="public/icon-128.png" alt="logo"/>
  <h1>Gemini Voyager</h1>
  <h3>Supercharge Your Gemini Experience ✨</h3>
  <p>Navigate conversations with an elegant timeline, organize chats with folders, and save your favorite prompts—all in one powerful extension.</p>
</div>

<p align="center">
  <a href="./.github/README_ZH.md">中文说明</a>
</p>

---

## 🚀 Quick Install

<div align="center">
  <a href="https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol?utm_source=item-share-cb" target="_blank">
    <img src="https://img.shields.io/badge/Install%20Now-Chrome%20Web%20Store-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Install from Chrome Web Store" height="60">
  </a>

  <p><b>Works on all Chromium browsers: Chrome, Edge, Opera, Brave, Vivaldi, Arc, and more</b></p>
  <p><b>Safari support: Available via manual installation</b> - Download from <a href="https://github.com/Nagi-ovo/gemini-voyager/releases">Releases</a> and see <a href=".github/docs/safari/INSTALLATION.md">installation guide</a></p>

  <details>
  <summary><i>Using Edge or Opera? Click here for installation tips</i></summary>
  <br>
  <p align="left">
    <b>For Microsoft Edge users:</b><br>
    1. Click the install button above to visit Chrome Web Store<br>
    2. You'll see a prompt "Allow extensions from other stores"<br>
    3. Click "Allow" and then install normally<br>
    <br>
    <b>For Opera users:</b><br>
    1. First install <a href="https://addons.opera.com/extensions/details/install-chrome-extensions/">Install Chrome Extensions</a> (official Opera extension)<br>
    2. Then click the install button above<br>
    3. Install like you would on Chrome<br>
    <br>
    <b>For Brave, Vivaldi, Arc, and other Chromium browsers:</b><br>
    Just click the install button above—it works right out of the box! No extra steps needed.
  </p>
  </details>

  <p><i>Firefox and Safari: Download from <a href="https://github.com/Nagi-ovo/gemini-voyager/releases">GitHub Releases</a> (manual installation required)</i></p>
</div>

---

## ✨ What Can It Do?

**Gemini Voyager** enhances your Gemini chat experience with four powerful features:

<div align="center">
  <img src="public/teaser.png" alt="teaser"/>
</div>

### 📍 Interactive Timeline

Navigate your conversations like never before:
- **Visual Navigation**: See all your messages as clickable nodes on a timeline
- **Quick Preview**: Hover over any node to preview your message
- **Star Important Messages**: Long-press to mark key moments—stars sync across all your tabs
- **Always in Sync**: Scroll freely; the timeline stays perfectly aligned with your chat
- **Subtle Design**: Timeline bar uses subtle transparency (0.3 opacity) that becomes fully opaque on hover

### 📂 Folder Manager

Keep your conversations organized:
- **Drag & Drop**: Simply drag conversations from the sidebar into folders
- **Two-Level Organization**: Create folders and subfolders for better structure
- **Folder Management**: Right-click folders for context menu (rename, duplicate, delete)
- **Duplicate Folders**: Copy entire folders with all conversations for A/B testing or backups
- **Smart Icons**: Automatically shows unique icons for different Gem types (Learning Coach, Coding Partner, Writing Editor, and more)
- **Smooth Navigation**: Switch between conversations instantly—no page reloads
- **Persistent Storage**: Your folder structure is saved locally in your browser and shared across all your Gemini accounts (u/0, u/1, etc.)
- **Responsive UI**: Folder header adapts elegantly when sidebar is resized

### 💡 Prompt Manager

Build your personal prompt library:
- **Save & Reuse**: Store your favorite prompts with custom tags
- **Instant Search**: Find prompts quickly with keyword search
- **One-Click Copy**: Reuse prompts with a single click
- **Import/Export**: Share your prompt library as JSON files
- **Works Everywhere**: Available on both Gemini and AI Studio

### 💾 Export Chat History

Download your conversations for safekeeping:
- **One-Click Export**: Click the export icon next to the Gemini logo
- **Clean JSON Format**: Get your chats in a structured, readable format
- **Includes Stars**: Your starred messages are preserved in the export
- **No Clutter**: Automatically removes UI labels like "Show thinking" for cleaner data

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

---

## 📥 Installation Options

### Option 1: Chrome Web Store (Recommended)

The easiest way to get started:

1. **Visit the Chrome Web Store**: [Install Gemini Voyager](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol?utm_source=item-share-cb)
2. **Click "Add to Chrome"**
3. **You're all set!** The extension will activate automatically on Gemini

**Works on:** Chrome, Edge, Opera, and other Chromium-based browsers

### Option 2: Manual Installation (Advanced)

For developers or users who prefer manual installation:

#### Load your extension (Chromium: Chrome / Edge / Opera)

1. Go to the [repository Releases page](https://github.com/Nagi-ovo/gemini-voyager/releases) and download the latest archive named like `gemini-voyager-chrome-vX.Y.Z.zip`.
2. Unzip it to a folder (you will see `manifest.json` at the root).
3. Open your extensions page and enable Developer mode:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Opera: `opera://extensions`
4. Click "Load unpacked".
5. Select the unzipped folder (e.g. `Gemini Voyager vX.Y.Z`).

#### Load your extension (Firefox)

1. Go to the [repository Releases page](https://github.com/Nagi-ovo/gemini-voyager/releases) and download `gemini-voyager-firefox-vX.Y.Z.zip`
2. Unzip it
3. Open `about:debugging#/runtime/this-firefox` in Firefox
4. Click "Load Temporary Add-on…"
5. Select the `manifest.json` inside the unzipped folder

#### Load your extension (Safari)

Safari extensions require conversion to an Xcode project. **See [installation guide](.github/docs/safari/INSTALLATION.md) ([中文](.github/docs/safari/INSTALLATION_ZH.md)) for detailed instructions.**

**Quick Start:**
1. Download `gemini-voyager-safari-vX.Y.Z.zip` from [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases)
2. Unzip it to get the `dist_safari` folder
3. Convert to Safari format: `xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"`
4. Open the generated Xcode project and run (⌘R)
5. Enable in Safari → Settings → Extensions

**Requirements:** macOS 11+, Xcode Command Line Tools, Safari 14+

**Note:** Safari extensions cannot be installed like Chrome/Firefox. You need to convert and run through Xcode. No Apple Developer account required for local testing!

---

## 🛠️ For Developers

Want to contribute or customize the extension? Here's how to set up the development environment:

```bash
# Install dependencies (Bun recommended)
bun i

# Development mode (with auto-reload)
bun run dev:chrome   # Chrome & Chromium browsers
bun run dev:firefox  # Firefox
bun run dev:safari   # Safari (requires macOS)

# Production builds
bun run build:chrome   # Chrome
bun run build:firefox  # Firefox
bun run build:safari   # Safari
bun run build:all      # All browsers
```

Or with npm/pnpm:
```bash
npm install
npm run dev:chrome    # Chrome
npm run dev:firefox   # Firefox
npm run dev:safari    # Safari (macOS only)
```

### Safari Development

Safari development requires additional steps. See [SAFARI_BUILD.md](SAFARI_BUILD.md) for:
- Converting the extension to Safari format
- Running in Xcode
- Debugging tips
- Publishing to App Store

**Technical Note**: Safari support uses conditional compilation to ensure zero performance impact on Chrome/Firefox builds. Chrome and Firefox use native `chrome.*` API (0.67kb wrapper), while Safari uses the same API wrapper approach for compatibility.

For contribution guidelines and best practices, see [CONTRIBUTING.md](./.github/CONTRIBUTING.md).

---

## 🙏 Credits

Inspired by [ChatGPT Conversation Timeline](https://github.com/Reborn14/chatgpt-conversation-timeline). We adapted the timeline concept for Gemini and added extensive new features including folder management, prompt library, and chat export.


## 🤝 Contributing

We welcome contributions from everyone! Whether you want to:
- 🐛 Report a bug
- 💡 Suggest a new feature
- 📝 Improve documentation
- 🔧 Submit code improvements

**Getting Started:**
- **Bug Reports**: Use our [bug report template](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/bug_report.md)
- **Feature Requests**: Use our [feature request template](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/feat_request.md)
- **Pull Requests**: Check out [CONTRIBUTING.md](./.github/CONTRIBUTING.md) for guidelines

Thank you for helping make **Gemini Voyager** better! ❤️

---

## ☕ Support This Project

If you find **Gemini Voyager** helpful and want to support its development, consider buying me a coffee! Your support helps keep this project alive and growing.

<div align="center">
  <a href="https://www.buymeacoffee.com/Nag1ovo" target="_blank">
    <img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" >
  </a>
</div>

<div align="center">
  <p><b>Or support via WeChat / Alipay:</b></p>
  <table>
    <tr>
      <td align="center">
        <img src="public/wechat-sponsor.png" alt="WeChat Pay" width="200"><br>
        <sub><b>WeChat Pay</b></sub>
      </td>
      <td align="center">
        <img src="public/alipay-sponsor.jpg" alt="Alipay" width="200"><br>
        <sub><b>Alipay</b></sub>
      </td>
    </tr>
  </table>
</div>

---

<div align="center">
  <p>Made with ❤️ for the Gemini community</p>
  <p>If you find this useful, consider giving us a ⭐ on GitHub!</p>
</div>