# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Safari browser support** 🎉
  - Added `vite.config.safari.ts` for Safari-specific build configuration
  - Added `nodemon.safari.json` for Safari development mode with auto-reload
  - Added `scripts/build-safari.sh` automated build script for Safari
  - Added comprehensive Safari build guide (`SAFARI_BUILD.md`)
  - Added Safari build commands to `package.json`:
    - `npm run build:safari` - Build for Safari
    - `npm run dev:safari` - Development mode for Safari
    - `npm run build:all` - Build for all browsers (Chrome, Firefox, Safari)

### Changed
- **Cross-browser compatibility improvements**
  - Migrated from `chrome.*` API to `browser.*` API (via webextension-polyfill) for better cross-browser support
  - Updated `src/pages/popup/Popup.tsx` to use Promise-based storage API
  - Updated `src/pages/content/timeline/manager.ts` to use browser.storage with proper error handling
  - Updated `src/pages/content/prompt/index.ts` to use unified browser API
  - Updated `src/pages/content/export/index.ts` to use cross-browser compatible storage
  - All storage API calls now use async/await pattern instead of callbacks

### Fixed
- **Dependency version conflicts**
  - Downgraded `marked` from v12 to v11 for compatibility with `marked-katex-extension`
  - Upgraded `@typescript-eslint/eslint-plugin` from v7 to v8 to match parser version
  - Resolved all peer dependency conflicts for clean `npm install`

### Documentation
- Updated `README.md` with Safari installation and development instructions
- Added detailed Safari build guide (`SAFARI_BUILD.md`) including:
  - Prerequisites and system requirements
  - Quick start guide
  - Development workflow
  - Common troubleshooting tips
  - App Store publishing guide
- Updated developer setup instructions with all three browser platforms

### Technical Details
- Extension now supports three major browser engines:
  - **Chromium** (Chrome, Edge, Opera, Brave, Vivaldi, Arc)
  - **Gecko** (Firefox)
  - **WebKit** (Safari) ⭐ NEW
- All features work consistently across all supported browsers:
  - ✅ Interactive Timeline
  - ✅ Folder Manager
  - ✅ Prompt Manager
  - ✅ Chat Export

## [0.6.1] - Previous Release

### Features
- Interactive conversation timeline with visual navigation
- Folder management for organizing chats
- Prompt library with tags and search
- Chat history export to JSON
- Cross-tab star synchronization
- Markdown and KaTeX rendering support
- Multi-language support (English, 中文)

---

## Migration Notes

### For Users
- No changes required for existing Chrome/Firefox users
- Safari users: Follow the new installation guide in `SAFARI_BUILD.md`

### For Developers
- All `chrome.*` API usage has been replaced with `browser.*`
- Storage API calls now return Promises (use `.then()` or `await`)
- `npm install` now works without `--legacy-peer-deps` flag
- New build commands available for Safari development

### Breaking Changes
- None for end users
- For developers: If you have custom code using `chrome.*` API, update to `browser.*`

---

## Credits

Safari support implementation includes:
- Cross-browser API compatibility layer using `webextension-polyfill`
- Safari Web Extension Converter integration
- Comprehensive documentation and build automation

Special thanks to the WebExtensions community for cross-browser standards.

