# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Safari browser support** 🎉
  - Safari build configuration and development mode
  - Installation guide ([EN](.github/docs/safari/INSTALLATION.md) | [中文](.github/docs/safari/INSTALLATION_ZH.md))
  - Development guide ([EN](safari/README.md) | [中文](safari/README_ZH.md))
  - New commands: `build:safari`, `dev:safari`, `build:all`

### Changed
- **Cross-browser compatibility**
  - Migrated to `browser.*` API via `webextension-polyfill` for better compatibility
  - All storage APIs now use async/await pattern

### Fixed
- **Dependencies**
  - Downgraded `marked` to v11 for compatibility
  - Upgraded `@typescript-eslint/eslint-plugin` to v8
  - Resolved peer dependency conflicts

### Supported Browsers
- **Chromium** (Chrome, Edge, Opera, Brave, Vivaldi, Arc)
- **Gecko** (Firefox)
- **WebKit** (Safari) ⭐ NEW

## [0.6.1] - Previous Release

### Features
- Interactive conversation timeline
- Folder management
- Prompt library with search
- Chat export to JSON
- Cross-tab star sync
- Markdown/KaTeX rendering
- Multi-language (EN, 中文)

---

## Migration Notes

### Users
- Chrome/Firefox: No changes needed
- Safari: See [installation guide](.github/docs/safari/INSTALLATION.md)

### Developers
- API changed from `chrome.*` to `browser.*`
- Storage now uses Promises (async/await)
- New Safari build commands available

