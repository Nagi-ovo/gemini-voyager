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
1. Download `gemini-voyager-firefox-vX.Y.Z.zip` from [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Unzip it.
3. Go to `about:debugging` > **This Firefox**.
4. Click **Load Temporary Add-on...** and select the `manifest.json` file inside the folder.
*(Note: This persists until you restart Firefox. For permanent installation, see the [developer guide](https://github.com/Nagi-ovo/gemini-voyager).)*

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
