# Safari Extension Installation Guide

English | [简体中文](INSTALLATION_ZH.md)

A simple guide for installing Voyager on Safari.

## Requirements

- **macOS 11+**
- **Safari 15.4+**

## Installation Steps

### 1. Download

Get the latest `voyager-vX.Y.Z.dmg` from [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).

### 2. Install

Double-click the `.dmg` file and follow the prompts to install the application.

### 3. Enable in Safari

1. Open **Safari → Settings** (or Preferences)
2. Go to **Extensions** tab
3. Check **Voyager** to enable
4. Visit [Gemini](https://gemini.google.com) to test

Done! 🎉

## Troubleshooting

### Safari doesn't show the extension

1. Safari → Settings → Advanced → Enable "Show Develop menu"
2. Develop → Allow Unsigned Extensions
3. Restart Safari

## For Developers

Build the web extension, then open the tracked Xcode project:

```bash
bun i
bun run build:safari
open "Gemini Voyager/Gemini Voyager.xcodeproj"
```

The active Swift files live inside `Gemini Voyager/`; no separate Swift setup is required.

## Uninstall

1. Safari → Settings → Extensions → Uncheck Voyager
2. Delete the app from Applications folder

---

**Need help?** Open an issue on [GitHub](https://github.com/Nagi-ovo/gemini-voyager/issues)
