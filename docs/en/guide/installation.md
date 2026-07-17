# Installation

::: info News
🍎 **Safari Native Extension is launched!** It is completely free and supports one-click installation.
:::

Choose your path.

> ⚠️ Note: Prompt Manager is the only feature that supports Gemini™ for Enterprise.

## 1. Extension Stores (Recommended)

The simplest way to get started. Updates are automatic.

**Chrome / Edge / Brave / Opera / Vivaldi:**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Download-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Install from Chrome Web Store" height="40"/>](https://chromewebstore.google.com/detail/iifacdnjakkhjjiengaffnegbndgingi?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=en)

**Microsoft Edge:**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Download-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Install from Microsoft Edge Add-ons" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

> **Edge users:** Voyager is still maintained on [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne), especially for users who need Edge on mobile or tablet. If review is delayed, Chrome Web Store and GitHub manual packages remain available.

**Firefox:**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Download-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Install from Firefox Add-ons" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. The Manual Way (Latest Features)

The Web Store review process can be slow. If you want the cutting-edge version immediately, install manually.

**For Chrome / Edge / Brave / Opera:**

1. Download the latest `voyager-chrome-vX.Y.Z.zip` from [GitHub Releases](https://github.com/Nagi-ovo/voyager/releases).
2. Unzip the file.
3. Open your browser's Extensions page (`chrome://extensions`).
4. Enable **Developer mode** (top right).
5. Click **Load unpacked** and select the folder you just unzipped.

**For Firefox:**

1. Download the latest `voyager-firefox-vX.Y.Z.xpi` from [Releases](https://github.com/Nagi-ovo/voyager/releases).
2. Open the Add-ons Manager (`about:addons`).
3. Drag and drop the `.xpi` file to install (or click the gear icon ⚙️ -> **Install Add-on From File**).

> 💡 The XPI file is officially signed by Mozilla and can be permanently installed in all Firefox versions.

## 3. Safari (macOS)

Safari now supports direct distribution! Download the pre-signed app:

::: warning Upgrading from `Gemini Voyager.app`
The containing app is now named `Voyager.app`. Because macOS does not replace apps whose filenames differ, do not leave both copies installed.

1. In the old extension, open the Gemini and AI Studio tabs you use, then run **Cloud Sync > Upload to Cloud**. If you use synced highlights, enable highlight sync before uploading.
2. Export the prompt library as a local JSON file for an independent fallback.
3. Quit Safari and the containing app.
4. Move `/Applications/Gemini Voyager.app` to the Trash. Do not click Safari's **Uninstall** button, and do not clear Safari extension data, website data, or containers.
5. Copy `Voyager.app` into `/Applications`, open it once, and then enable Voyager in Safari if prompted.
6. Verify your folders, prompts, settings, and starred items. If anything is missing, use **Download & Merge** or import the prompt JSON.

Voyager keeps the existing app and extension bundle identifiers, so macOS and Safari continue to recognize the same product identity. The backup steps are a precaution for older manual installations.
:::

1. Download the <SafariDownloadLink>latest Safari version (.dmg)</SafariDownloadLink>.
2. Double-click to open and follow the prompts to install.
3. Double-click to launch the app.
4. Enable the extension in **Safari Settings > Extensions**.

> 💡 The Safari build is now directly signed for distribution—no Xcode conversion needed!
>
> ⚠️ **Limitations**: Due to Safari's nature, (a) Watermark removal (b) Image export (PDF recommended) are not supported.

---

_Development setup? If you are a developer looking to contribute, check out our [Contributing Guide](https://github.com/Nagi-ovo/voyager/blob/main/.github/CONTRIBUTING.md)._
