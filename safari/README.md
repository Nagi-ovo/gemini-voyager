# Safari Native Extension Code

English | [简体中文](README_ZH.md)

This directory contains native Swift code for the Safari extension, enabling deeper macOS integration and native functionality.

## 📁 Structure

```
safari/
├── App/
│   └── SafariWebExtensionHandler.swift  # Main message handler
├── Models/
│   └── SafariMessage.swift              # Message type definitions
└── Resources/
    └── (Xcode will link dist_safari here)
```

## 🔧 How It Works

When you convert the extension using `xcrun safari-web-extension-converter`, Xcode automatically:
1. Creates a new macOS app project
2. Links these Swift files into the project
3. Handles native messaging between JavaScript and Swift

## 📬 Native Messaging API

### From JavaScript to Swift

```javascript
// Send a message to native Swift code
browser.runtime.sendNativeMessage('ping', {}, (response) => {
  if (response.success) {
    console.log('Native response:', response.data);
  }
});

// Get version info
browser.runtime.sendNativeMessage('getVersion', {}, (response) => {
  console.log('Version:', response.data.version);
  console.log('Platform:', response.data.platform);
});
```

### Available Actions

| Action | Description | Return Value |
|--------|-------------|--------------|
| `ping` | Health check | `{ status: "ok", message: "pong" }` |
| `getVersion` | Get extension info | `{ version, build, platform }` |
| `syncStorage` | Sync storage (future) | `{ synced: false }` |

## 🚀 Current Features

### ✅ Implemented

- **Health Check**: `ping` action for verifying native messaging works
- **Version Info**: Get extension version and platform info
- **Logging**: Unified logging using `os.log` for debugging

### 🔮 Future Possibilities

The Swift code provides a foundation for:

- **Keychain Integration**: Secure storage for sensitive data
- **Native Notifications**: macOS notification center integration
- **File System Access**: Export/import with native file picker
- **Shared Containers**: Sync between Safari on multiple devices
- **Background Tasks**: Long-running operations in Swift

## 🛠️ How to Use

### Step 1: Build the Web Extension

```bash
bun run build:safari
```

### Step 2: Convert to Safari Extension

```bash
xcrun safari-web-extension-converter dist_safari \
  --macos-only \
  --app-name "Gemini Voyager"
```

### Step 3: Add Swift Files to Xcode

1. Open `Gemini Voyager/Gemini Voyager.xcodeproj`
2. Right-click "Gemini Voyager Extension" target
3. Add Files → Select files from `safari/` directory
4. Make sure "Copy items if needed" is checked
5. Select "Gemini Voyager Extension" target

### Step 4: Build and Run

Press ⌘R in Xcode to build and run the extension.

## 🔍 Debugging Native Code

### View Logs

```bash
# Real-time logs from Safari extension
log stream --predicate 'subsystem == "com.gemini-voyager.safari"' --level debug
```

### Common Issues

**Q: "Module 'SafariServices' not found"**
- A: Make sure files are added to the "Gemini Voyager Extension" target, not the main app target

**Q: Native messaging doesn't work**
- A: Verify `SafariWebExtensionHandler` is set as the principal class in `Info.plist`

**Q: Swift files not included in build**
- A: Check Target Membership in Xcode inspector

## 📚 Resources

- [Safari Web Extensions Documentation](https://developer.apple.com/documentation/safariservices/safari_web_extensions)
- [Native Messaging in Safari](https://developer.apple.com/documentation/safariservices/safari_web_extensions/messaging_between_the_app_and_javascript_in_a_safari_web_extension)
- [os.log Documentation](https://developer.apple.com/documentation/os/logging)

## 🤝 Contributing

When adding new native features:

1. Define the action in `SafariMessage.swift`
2. Implement the handler in `SafariWebExtensionHandler.swift`
3. Add corresponding JavaScript code in the web extension
4. Update this README with usage examples

## 📝 License

Same as the main project (MIT).
