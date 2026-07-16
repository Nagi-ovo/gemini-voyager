# Safari Development Guide

English | [简体中文](README_ZH.md)

Developer guide for building and extending Voyager for Safari.

> [!TIP]
> **Looking to install?** You can now download the pre-signed app directly from the [latest release](https://github.com/Nagi-ovo/gemini-voyager/releases/latest). Simply download the `.dmg` and follow the prompts to install.

## Quick Start

### Build from Source

```bash
# Install dependencies
bun install

# Build for Safari
bun run build:safari
```

This creates a `dist_safari/` folder with the extension files.

### Convert and Run

```bash
# Convert to Safari format
xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"

# Open in Xcode
open "Gemini Voyager/Gemini Voyager.xcodeproj"
```

In Xcode:

1. Select **Signing & Capabilities** → Choose your Team
2. Set target to **My Mac**
3. Press **⌘R** to build and run

## Development Workflow

### Auto-reload on Changes

```bash
bun run dev:safari
```

This watches for file changes and rebuilds automatically. After each rebuild:

1. Press **⌘R** in Xcode to reload
2. Safari will refresh the extension

### Manual Build

```bash
# After code changes
bun run build:safari

# Then rebuild in Xcode (⌘R)
```

## macOS App and Swift Extension

No manual setup is required. The tracked Xcode project already contains the macOS app and its Swift Safari extension. Sparkle runs in the app; response-completion notifications run in the Swift extension.

### Native Messaging API

[<img src="https://devin.ai/assets/askdeepwiki.png" alt="Ask DeepWiki" height="20"/>](https://deepwiki.com/Nagi-ovo/gemini-voyager)

**From JavaScript:**

```javascript
const response = await browser.runtime.sendNativeMessage(
  'com.yourCompany.Gemini-Voyager',
  { action: 'ping' },
);
```

**Available Actions:**

- `ping` - Health check
- `requestNotificationPermission` - Ask for macOS notification permission
- `showNotification` - Show a response-completion notification

## Debugging

### View Extension Logs

**Web Console:**

- Safari → Develop → Web Extension Background Pages → Gemini Voyager

**Native Logs:**

```bash
log stream --predicate 'subsystem == "com.gemini-voyager.safari"' --level debug
```

### Common Issues

**"Module 'SafariServices' not found"**

- Ensure Swift files are added to "Gemini Voyager Extension" target, not the main app

**Native messaging not working**

- Check `Info.plist` has `SafariWebExtensionHandler` as principal class

**Swift files not compiling**

- Verify Target Membership in Xcode file inspector

## Building for Distribution

### Create Archive

1. Product → Archive in Xcode
2. Window → Organizer
3. Select archive → Distribute App
4. Follow prompts to export

### For App Store

Requires:

- Apple Developer account ($99/year)
- App Store Connect setup
- App review submission

See [Apple's official guide](https://developer.apple.com/documentation/safariservices/safari_web_extensions/distributing_your_safari_web_extension) for details.

## Project Structure

[<img src="https://devin.ai/assets/askdeepwiki.png" alt="Ask DeepWiki" height="20"/>](https://deepwiki.com/Nagi-ovo/gemini-voyager)

```
├── dist_safari/              # Built extension (gitignored)
├── safari/                   # Native Swift code
│   ├── App/                 # Extension handlers
│   ├── Models/              # Data models
│   └── Resources/           # Example code
├── src/                     # Main extension source
└── vite.config.safari.ts    # Safari build config
```

## Build Commands

```bash
bun run build:safari   # Production build
bun run dev:safari     # Development with auto-reload
bun run build:all      # Build for all browsers
```

## Direct-Install Updates

Direct-install builds use Sparkle in the containing macOS app. The existing JavaScript reminder remains enabled by default so older installs can discover the first Sparkle-enabled DMG.

For an App Store build, disable the direct-release reminder:

```bash
ENABLE_SAFARI_UPDATE_CHECK=false bun run build:safari
```

Sparkle checks while the containing app is running. Users can also choose **Check for Updates…** from the app menu.

## Known Limitations

Due to Safari's technical architecture and security restrictions, the following features are currently unavailable in the Safari version:

- **(a) Nano Banana Watermark Removal**: Watermark detection and removal for Gemini™-generated images is not supported.
- **(b) Image Export**: Direct export to image format is not supported (including in Chat Export). **Recommendation**: Use **PDF Export** instead.

## Resources

- [Safari Web Extensions Docs](https://developer.apple.com/documentation/safariservices/safari_web_extensions)
- [Native Messaging Guide](https://developer.apple.com/documentation/safariservices/safari_web_extensions/messaging_between_the_app_and_javascript_in_a_safari_web_extension)
- [Converting Extensions for Safari](https://developer.apple.com/documentation/safariservices/safari_web_extensions/converting_a_web_extension_for_safari)

## Contributing

See [CONTRIBUTING.md](../.github/CONTRIBUTING.md) for contribution guidelines.

When adding native features:

1. Define action in `SafariMessage.swift`
2. Implement handler in `SafariWebExtensionHandler.swift`
3. Add JavaScript API in web extension
4. Document in this README
