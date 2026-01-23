# Safari Extension Installation Guide

English | [简体中文](INSTALLATION_ZH.md)

A simple guide for installing Gemini Voyager on Safari.

## Requirements

- **macOS 11+**
- **Safari 14+**
- **Xcode Command Line Tools** (install via `xcode-select --install`)

**Note:** No Apple Developer account needed for local use!

## Installation Steps

### 1. Download

Get the latest `gemini-voyager-safari-vX.Y.Z.zip` from [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).

### 2. Unzip

```bash
unzip gemini-voyager-safari-vX.Y.Z.zip
```

You'll get a `dist_safari/` folder.

### 3. Convert to Safari Format

Safari requires converting the extension to an Xcode project:

```bash
xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
```

This creates a `Gemini Voyager/` folder with the Xcode project.

**💡 Tip:** If you see `xcrun: command not found`, install Xcode Command Line Tools first:

```bash
xcode-select --install
```

### 4. Open and Run in Xcode

```bash
open "Gemini Voyager/Gemini Voyager.xcodeproj"
```

In Xcode:

1. Select **Signing & Capabilities** tab
2. Choose your Team (free personal account works fine)
3. Set target to **My Mac**
4. Click ▶️ or press **⌘R** to run

Safari will open automatically with the extension loaded.

### 5. Enable in Safari

After running:

1. Open **Safari → Settings** (or Preferences)
2. Go to **Extensions** tab
3. Check **Gemini Voyager** to enable
4. Visit [Gemini](https://gemini.google.com) to test

Done! 🎉

## Troubleshooting

### Safari doesn't show the extension

1. Safari → Settings → Advanced → Enable "Show Develop menu"
2. Develop → Allow Unsigned Extensions
3. Restart Safari

### Need to debug?

- **View logs:** Safari → Develop → Web Extension Background Pages → Gemini Voyager
- **Inspect pages:** Right-click on Gemini page → Inspect Element

### Do I need an Apple Developer account?

- **For personal use:** No, use "Allow Unsigned Extensions"
- **To share with others:** They need to build it themselves, or you need a Developer account
- **For App Store:** Yes ($99/year)

## For Developers

Want to build from source or contribute? See the [Safari Development Guide](../../../safari/README.md) for:

- Building from source
- Development workflow
- Adding Swift native code
- Advanced debugging

## Uninstall

1. Safari → Settings → Extensions → Uncheck Gemini Voyager
2. Delete the app from Applications folder
3. Clean up: `rm -rf "Gemini Voyager" dist_safari`

---

**Need help?** Open an issue on [GitHub](https://github.com/Nagi-ovo/gemini-voyager/issues)
