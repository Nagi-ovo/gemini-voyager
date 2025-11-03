<div align="center">
  <img src="public/icon-128.png" alt="logo"/>
  <h1>Gemini Voyager</h1>
  <h3>Supercharge Your Gemini Experience ✨</h3>
  <p>Navigate conversations with an elegant timeline, organize chats with folders, and save your favorite prompts—all in one powerful extension.</p>
  
  <p>
    <img src="https://img.shields.io/badge/Chrome-✓-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
    <img src="https://img.shields.io/badge/Edge-✓-0078D7?style=flat-square&logo=microsoftedge&logoColor=white" alt="Edge">
    <img src="https://img.shields.io/badge/Firefox-✓-FF7139?style=flat-square&logo=firefox&logoColor=white" alt="Firefox">
    <img src="https://img.shields.io/badge/Safari-✓-000000?style=flat-square&logo=safari&logoColor=white" alt="Safari">
    <img src="https://img.shields.io/badge/Opera-✓-FF1B2D?style=flat-square&logo=opera&logoColor=white" alt="Opera">
    <img src="https://img.shields.io/badge/Brave-✓-FB542B?style=flat-square&logo=brave&logoColor=white" alt="Brave">
  </p>
</div>

<p align="center">
  <a href="./.github/README_ZH.md">中文说明</a>
</p>

---

## ✨ What Can It Do?

**Gemini Voyager** enhances your Gemini chat experience with five powerful features:

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

<details>
<summary>Example payload shape</summary>

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
</details>

### 📏 Adjustable Chat Width

Customize your reading experience:
- **Wide Range**: Adjust chat width from 400px to 1400px via an interactive slider
- **Instant Preview**: See changes in real-time as you drag the slider
- **Persistent Settings**: Your preference is saved and synced across all tabs

---

## 📥 Installation

> **⚠️ Recommended:** Download the latest version from [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases)  
> The Chrome Web Store version may lag behind due to review delays.

### Option 1: Manual Installation (Recommended)

**For Chromium browsers (Chrome, Edge, Opera, Brave, Vivaldi, Arc):**

1. Go to the [repository Releases page](https://github.com/Nagi-ovo/gemini-voyager/releases) and download the latest `gemini-voyager-chrome-vX.Y.Z.zip`
2. Unzip it to a folder (you will see `manifest.json` at the root)
3. Open your extensions page and enable Developer mode:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Opera: `opera://extensions`
4. Click "Load unpacked"
5. Select the unzipped folder

<details>
<summary>Firefox Installation</summary>

1. Go to the [repository Releases page](https://github.com/Nagi-ovo/gemini-voyager/releases) and download `gemini-voyager-firefox-vX.Y.Z.zip`
2. Unzip it
3. Open `about:debugging#/runtime/this-firefox` in Firefox
4. Click "Load Temporary Add-on…"
5. Select the `manifest.json` inside the unzipped folder
</details>

<details>
<summary>Safari Installation</summary>

1. Download `gemini-voyager-safari-vX.Y.Z.zip` from [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases)
2. Unzip and convert: `xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"`
3. Open in Xcode and run (⌘R)
4. Enable in Safari → Settings → Extensions

**Requirements:** macOS 11+, Xcode Command Line Tools (`xcode-select --install`), Safari 14+

**Note:** No Apple Developer account needed for local use! For detailed instructions, see the [installation guide](.github/docs/safari/INSTALLATION.md) ([中文](.github/docs/safari/INSTALLATION_ZH.md)).
</details>

### Option 2: Chrome Web Store (Easier but may be outdated)

<div align="center">
  <a href="https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol?utm_source=item-share-cb" target="_blank">
    <img src="https://img.shields.io/badge/Install%20from-Chrome%20Web%20Store-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Install from Chrome Web Store" height="50">
  </a>
</div>

The easiest installation method, but may not have the latest features:

1. Click the button above to visit the Chrome Web Store
2. Click "Add to Chrome"
3. The extension will activate automatically on Gemini

**Works on:** Chrome, Edge, Opera, Brave, Vivaldi, Arc, and other Chromium browsers

<details>
<summary>Installation tips for Edge and Opera users</summary>

**For Microsoft Edge users:**
1. Visit Chrome Web Store via the button above
2. You'll see a prompt "Allow extensions from other stores"
3. Click "Allow" and install normally

**For Opera users:**
1. First install [Install Chrome Extensions](https://addons.opera.com/extensions/details/install-chrome-extensions/) (official Opera extension)
2. Then visit Chrome Web Store
3. Install like you would on Chrome

**For Brave, Vivaldi, Arc, and other Chromium browsers:**  
No extra steps needed—just install directly from Chrome Web Store!
</details>

---

## 🛠️ For Developers

<details>
<summary>Click to see development setup instructions</summary>

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
pnpm install
pnpm run dev:chrome    # Chrome
pnpm run dev:firefox   # Firefox
pnpm run dev:safari    # Safari (macOS only)
```

### Safari Development

Safari requires additional build steps. See [safari/README.md](safari/README.md) for:
- Building from source
- Development workflow with auto-reload
- Adding Swift native code
- Debugging and distribution

For contribution guidelines and best practices, see [CONTRIBUTING.md](./.github/CONTRIBUTING.md).
</details>

---

## 🙏 Credits

Inspired by [ChatGPT Conversation Timeline](https://github.com/Reborn14/chatgpt-conversation-timeline). We adapted the timeline concept for Gemini and added extensive new features including folder management, prompt library, and chat export.


## 🤝 Contributing

We welcome contributions! Whether you want to report bugs, suggest features, improve documentation, or submit code:

- **Issues**: Use our [bug report](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/bug_report.md) or [feature request](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/ISSUE_TEMPLATE/feat_request.md) templates
- **Pull Requests**: Check out [CONTRIBUTING.md](./.github/CONTRIBUTING.md) for guidelines

Thank you for helping make Gemini Voyager better! ❤️

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