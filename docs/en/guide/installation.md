# Installation

Choose your path.

## 1. The Easy Way (Chrome Web Store)
For Chrome, Edge, Brave, and Opera users.
This is the simplest way to get started. Updates are automatic.

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Download-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Install from Chrome Web Store" height="40"/>](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol)

1. Click the button above.
2. Click **Add to Chrome**.
3. You're done.

## 2. The Manual Way (Latest Features)
The Web Store review process can be slow. If you want the cutting-edge version immediately, install manually.

**For Chrome / Edge / Brave / Opera:**
1. Download the latest `gemini-voyager-chrome-vX.Y.Z.zip` from [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Unzip the file.
3. Open your browser's Extensions page (`chrome://extensions`).
4. Enable **Developer mode** (top right).
5. Click **Load unpacked** and select the folder you just unzipped.

## 3. Firefox

**Method 1: Firefox Add-ons (Recommended)**

[![Install from Firefox Add-ons](https://img.shields.io/badge/Firefox_Add--ons-Download-FF7139?style=for-the-badge&logo=firefox&logoColor=white)](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

The easiest way. Install from the official store with automatic updates.

**Method 2: XPI File (Manual Install)**
1. Download the latest `gemini-voyager-firefox-vX.Y.Z.xpi` from [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Open the Add-ons Manager (`about:addons`).
3. Drag and drop the `.xpi` file to install (or click the gear icon ⚙️ -> **Install Add-on From File**).

> 💡 The XPI file is officially signed by Mozilla and can be permanently installed in all Firefox versions.

## 4. Safari (macOS)
1. Download `gemini-voyager-safari-vX.Y.Z.zip` from [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Unzip the file.
3. Run the following command in Terminal to convert it (requires Xcode):
   ```bash
   xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
   ```
4. Run the app in Xcode to install.
5. Enable in Safari Settings > Extensions.

---
*Development setup? If you are a developer looking to contribute, check out our [Contributing Guide](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/CONTRIBUTING.md).*
