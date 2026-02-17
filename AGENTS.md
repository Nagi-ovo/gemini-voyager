---
trigger: always_on
---

# AGENTS.md - AI Assistant Guide for Gemini Voyager

> **Last Updated**: 2026-02-15
> **Version**: 1.2.5
> **Purpose**: Comprehensive guide for AI assistants working with the Gemini Voyager codebase

---

## 1. Role & Core Mandates

**Role**: You are an expert Full-Stack Engineer and Chrome Extension Specialist working on Gemini Voyager. Your goal is to deliver high-quality, robust, and idiomatic code that enhances the Google Gemini experience.

**Core Mandates**:

1.  **Safety First**: Never commit secrets. Validate all system operations.
2.  **Code Consistency**: Strictly follow the project's architectural patterns (Services, Stores, functional React).
3.  **Type Safety**: No `any`. Use `unknown` with narrowing. Use Branded Types for IDs.
4.  **Testing**: Every feature and fix must include tests.
5.  **Documentation**: Keep documentation and translations in sync with code changes.

---

## 2. Operational Methodology

Before writing code, apply this "Linus-style" problem-solving framework to ensure robust and simple solutions.

### Phase 1: The Three Questions

Ask yourself before starting:

1.  **"Is this a real problem?"** - Reject over-engineering.
2.  **"Is there a simpler way?"** - Always seek the simplest solution (KISS).
3.  **"Will it break anything?"** - Backward compatibility is an iron law.

### Phase 2: Requirements Analysis

When analyzing a request:

1.  **Data Structure First**: "Bad programmers worry about the code. Good programmers worry about data structures."
    - What is the core data? Who owns it?
    - Can we redesign data structures to eliminate branches/complexity?
2.  **Eliminate Special Cases**: "Good code has no special cases."
    - Identify `if/else` branches that patch bad design.
    - Refactor to make the "special case" the normal case.
3.  **Destructive Analysis**:
    - List all existing features that might be affected.
    - Ensure zero destructiveness to user data (especially `localStorage`).

### Phase 3: Decision Output

If a task is complex or ambiguous, present your analysis in this format:

```text
【Core Judgment】
✅ Worth doing: [reason] / ❌ Not worth doing: [reason]

【Key Insights】
- Data structure: [most critical data relationships]
- Complexity: [complexity that can be eliminated]
- Risks: [potential breaking changes]

【Plan】
1. Simplify data structures...
2. Eliminate special cases...
3. Implementation steps...
```

---

## 3. Tool Usage & Verification Protocols

Strictly adhere to these protocols to prevent errors and ensure data integrity.

### 🛡️ The "Read-Write-Verify" Loop

1.  **READ**: Always read the target file **before** editing. Do not rely on memory or assumptions.
    - _Tool_: `read_file`
2.  **WRITE**: Apply atomic changes. Use sufficient context for `replace`.
    - _Tool_: `write_file` or `replace`
3.  **VERIFY**: Check the file content **after** editing to ensure the change was applied correctly and didn't break syntax.
    - _Tool_: `read_file` or `run_shell_command` (grep/cat)

### 🚨 Critical Safety Checks

- **Never** modify `dist_*` folders directly.
- **Never** commit `.env` or secrets.
- **Always** run `bun run typecheck` after modifying TypeScript definitions.
- **Always** run `bun run lint` before finishing.

---

## 4. Module Glossary & Complexity Hotspots

| Module (Path)                          | Responsibility                                    | Complexity | Notes                                                                          |
| -------------------------------------- | ------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `core/services/StorageService`         | **Single Source of Truth** for persistence.       | 🌶️ High    | Handles sync/local/session logic + migration. **Do not modify lightly.**       |
| `core/services/DataBackupService`      | Multi-layer backup protection.                    | 🌶️ High    | Critical for data safety. Race conditions possible during unload.              |
| `core/services/GoogleDriveSyncService` | Google Drive cloud sync (OAuth2).                 | 🌶️ High    | Handles folders, prompts, and starred messages sync. Requires OAuth2 identity. |
| `features/folder`                      | Drag-and-drop folder logic + cloud sync UI.       | 🌶️ High    | DOM manipulation + State sync is tricky. Watch out for infinite loops.         |
| `features/export`                      | Chat export (JSON/MD/PDF/Image) + Deep Research.  | 🌶️ High    | Image export, message selection, multi-browser compat. Fragile to Gemini UI.   |
| `features/backup`                      | File System Access API.                           | 🟡 Medium  | Browser compatibility issues (Safari fallback).                                |
| `pages/content`                        | **DOM Injection** (24 content script modules).    | 🟡 Medium  | Bridge between Gemini UI and Extension. Each sub-module is self-contained.     |
| `pages/content/mermaid`                | Mermaid diagram rendering.                        | 🟡 Medium  | Dynamic library loading with legacy fallback.                                  |
| `pages/content/watermarkRemover`       | NanoBanana watermark removal via fetch intercept. | 🟡 Medium  | Disabled on Safari. Uses `fetchInterceptor.js` injected into page context.     |

---

## 5. Development Standards & Anti-Patterns

### ✅ DOs

- **Prefer Plain Objects**: Use interfaces/types for data structures.
- **Immutability**: Use `map`, `filter`, `reduce`.
- **Encapsulation**: Use `private`/`protected` in classes.
- **Type Guarding**: Use `unknown` + narrowing (Zod or custom guards).
- **Named Exports**: `export function X` (easier refactoring).
- **Functional React**: Hooks at top level, strictly functional components.

### ❌ DON'Ts (Anti-Patterns)

- **Global State Pollution**: Never use global variables outside of defined Services.
- **Direct Storage Access**: Never use `chrome.storage` directly in UI components. Always use `StorageService`.
- **God Components**: Don't put business logic in UI files. Move it to `features/xxx/services` or custom hooks.
- **Any Type**: Explicitly banned. Use `unknown` if you must, then narrow it.
- **Magic Strings**: Use constants or enums, especially for Storage Keys and CSS Classes.
- **Console Logs**: Remove `console.log` in production code (use `LoggerService` for critical info).

---

## 6. Testing Strategy

**Framework**: Vitest 4.0.6 (jsdom environment)

### TDD Workflow Guidelines

1.  **Write the Test First**: Define the expected behavior in `*.test.ts`.
2.  **Fail**: Ensure the test fails (validates the test itself).
3.  **Implement**: Write the minimal code to pass the test.
4.  **Refactor**: Clean up the code while keeping tests green.

### Mocking Patterns

This project relies heavily on `vi.mock` for Chrome APIs and external services.

**Mocking Chrome API**:
The global `chrome` object is mocked in `src/tests/setup.ts`. You can inspect or override it in individual tests.

```typescript
// Example: Mocking specific storage behavior for a test
beforeEach(() => {
  (chrome.storage.sync.get as any).mockResolvedValue({ someKey: 'value' });
});
```

**Running Tests**:

```bash
bun run test                # Run all tests
bun run test <filename>     # Run specific test file
bun run test:watch          # Interactive mode
bun run test:coverage       # Check coverage
```

---

## 7. Workflows & Definition of Done

### Setup

```bash
bun install
```

### Development

```bash
# Start Dev Server
bun run dev:chrome
bun run dev:firefox
bun run dev:safari

# Build for production
bun run build:chrome
bun run build:firefox
bun run build:safari
bun run build:edge        # Repackages Chrome build for Edge
bun run build:all         # Build all platforms

# Documentation site (VitePress)
bun run docs:dev
bun run docs:build
```

_Note: Uses Nodemon for hot-reloading content scripts._

### Commit Messages (commitlint)

Use Conventional Commits format:

```
<type>(<scope>): <imperative summary>
```

- `type`: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `build`, `ci`, `perf`, `style`
- `scope`: short, feature-focused (e.g., `copy`, `export`, `popup`)
- summary: lowercase, imperative, no trailing period

Examples:

- `fix(copy): handle clipboard fallback`
- `refactor(copy): introduce temml to convert tex2mathml`
- `chore: update sponsors.svg`

### Definition of Done (DoD)

Before claiming a task is complete, verify:

1.  **Functionality**: Does it meet the requirements?
2.  **Tests**: Are there new tests? Do all tests pass (`bun run test`)?
3.  **Types**: No TypeScript errors (`bun run typecheck`)?
4.  **Linting**: Code formatted and linted (`bun run lint`)?
5.  **Build**: Does it build without error (`bun run build`)?
6.  **Safety**: No secrets committed? No destructive `localStorage` operations?

---

## 8. Repository Structure & File Map

```
gemini-voyager/
├── src/
│   ├── core/                           # 🧠 CORE LOGIC (Foundation)
│   │   ├── services/                   # Singleton Services
│   │   │   ├── StorageService.ts       #   - Central persistence layer
│   │   │   ├── DataBackupService.ts    #   - Multi-layer backup protection
│   │   │   ├── GoogleDriveSyncService  #   - Google Drive cloud sync (OAuth2)
│   │   │   ├── KeyboardShortcutService #   - Global keyboard shortcuts
│   │   │   ├── StorageMonitor.ts       #   - Storage usage monitoring
│   │   │   ├── DOMService.ts           #   - Safe DOM manipulation
│   │   │   └── LoggerService.ts        #   - Structured logging
│   │   ├── utils/                      # Core utilities
│   │   │   ├── browser.ts             #   - Browser detection (isSafari, etc.)
│   │   │   ├── extensionContext.ts    #   - Extension context invalidation
│   │   │   ├── concurrency.ts         #   - Concurrency primitives
│   │   │   ├── hash.ts                #   - Hashing utilities
│   │   │   ├── storageMigration.ts    #   - Storage migration helpers
│   │   │   ├── safariStorage.ts      #   - Safari storage helpers
│   │   │   ├── updateReminder.ts     #   - Update reminder utility
│   │   │   └── ...                    #   - (array, async, gemini, selectors, text, version)
│   │   └── types/                      # Global type definitions
│   │       ├── common.ts              #   - StorageKeys, shared types
│   │       ├── folder.ts              #   - Folder data types
│   │       ├── timeline.ts            #   - Timeline types
│   │       ├── keyboardShortcut.ts    #   - Shortcut types
│   │       └── sync.ts               #   - Cloud sync types
│   │
│   ├── features/                       # 🧩 FEATURES (Domain Logic)
│   │   ├── export/                     #   - Export (JSON/MD/PDF/Image/Deep Research)
│   │   ├── folder/                     #   - Folder organization
│   │   ├── backup/                     #   - File System backup
│   │   ├── formulaCopy/                #   - LaTeX copy
│   │   ├── contextSync/                #   - Context/clipboard sync
│   │   └── tableCopy/                  #   - Table copying
│   │
│   ├── pages/                          # 🚪 ENTRY POINTS (Application)
│   │   ├── background/                 #   - Service Worker
│   │   ├── popup/                      #   - Settings UI
│   │   │   └── components/            #   - CloudSync, KeyboardShortcut, StarredHistory, etc.
│   │   ├── content/                    #   - Content Scripts (Gemini DOM Injection)
│   │   │   ├── timeline/              #       * Timeline navigation
│   │   │   ├── prompt/                #       * Prompt manager
│   │   │   ├── deepResearch/          #       * Deep research tool
│   │   │   ├── mermaid/               #       * Mermaid diagram rendering
│   │   │   ├── watermarkRemover/      #       * NanoBanana watermark removal
│   │   │   ├── sendBehavior/          #       * Send key behavior customization
│   │   │   ├── folder/                #       * Folder sidebar management
│   │   │   ├── export/                #       * Export button & selection mode
│   │   │   ├── announcement/          #       * Announcement display
│   │   │   ├── shared/                #       * Shared content script utilities
│   │   │   └── ...                    #       * (chatWidth, defaultModel, folderSpacing,
│   │   │                              #          gemsHider, inputCollapse, katexConfig,
│   │   │                              #          markdownPatcher, quoteReply, recentsHider,
│   │   │                              #          sidebarAutoHide, sidebarWidth, titleUpdater,
│   │   │                              #          editInputWidth, contextSync)
│   │   ├── devtools/                   #   - DevTools panel
│   │   ├── options/                    #   - Options/Settings page
│   │   └── panel/                      #   - Side panel
│   │
│   ├── components/                     # 🧱 UI COMPONENTS (Presentation)
│   │   ├── ui/                         #   - Generic UI (Button, Card, Select, Slider, Switch, etc.)
│   │   ├── DarkModeToggle.tsx          #   - Dark mode toggle
│   │   └── LanguageSwitcher.tsx        #   - Language switcher
│   │
│   ├── contexts/                       # 🔗 REACT CONTEXTS
│   │   └── LanguageContext.tsx          #   - Language/i18n context provider
│   │
│   ├── utils/                          # 🔧 APPLICATION UTILITIES
│   │   ├── i18n.ts                     #   - Internationalization
│   │   ├── language.ts                 #   - Language detection/normalization
│   │   ├── merge.ts                    #   - Data merging (for cloud sync)
│   │   └── translations.ts            #   - Translation helpers
│   │
│   ├── locales/                        # 🌍 TRANSLATIONS (10 languages)
│   │   ├── en/    ar/    es/    fr/    #   - English, Arabic, Spanish, French
│   │   ├── ja/    ko/    pt/    ru/    #   - Japanese, Korean, Portuguese, Russian
│   │   └── zh/    zh_TW/              #   - Chinese (Simplified), Chinese (Traditional)
│   │
│   └── tests/                          # 🧪 GLOBAL TESTS
│       └── setup.ts                    #   - Vitest setup & mocks
│
├── public/                             # 📦 STATIC ASSETS
│   ├── contentStyle.css                #   - Injected CSS styles
│   ├── katex-config.js                 #   - KaTeX configuration
│   └── fetchInterceptor.js             #   - Network interception (watermark)
│
├── docs/                               # 📖 DOCUMENTATION (VitePress)
│
└── ... (config files)
```

### 📍 Where to Look (Task Map)

| Task                      | File Path / Directory                                              |
| ------------------------- | ------------------------------------------------------------------ |
| **Add new storage key**   | `src/core/types/common.ts` (StorageKeys)                           |
| **Change storage logic**  | `src/core/services/StorageService.ts`                              |
| **Update translations**   | `src/locales/*/messages.json` (all 10 locales)                     |
| **Modify export format**  | `src/features/export/services/`                                    |
| **Fix backup issues**     | `src/core/services/DataBackupService.ts` or `src/features/backup/` |
| **Fix cloud sync issues** | `src/core/services/GoogleDriveSyncService.ts`                      |
| **Adjust UI styles**      | `src/components/ui/` or `src/assets/styles/`                       |
| **Change DOM injection**  | `src/pages/content/`                                               |
| **Add keyboard shortcut** | `src/core/services/KeyboardShortcutService.ts` + types             |
| **Modify popup settings** | `src/pages/popup/components/`                                      |
| **Browser compatibility** | `src/core/utils/browser.ts` (detection) + feature-level guards     |

---

## 9. Important Files

- `manifest.json` / `manifest.dev.json`: Extension capabilities (includes OAuth2 for Google Drive sync).
- `vite.config.base.ts`: Shared build configuration.
- `vite.config.chrome.ts` / `vite.config.firefox.ts` / `vite.config.safari.ts`: Platform-specific builds.
- `src/core/types/common.ts`: Centralized types, StorageKeys, and constants.
- `src/core/services/StorageService.ts`: Data persistence layer.
- `src/core/services/GoogleDriveSyncService.ts`: Cloud sync with Google Drive.
- `src/core/utils/browser.ts`: Browser detection helpers (`isSafari()`, etc.).
- `src/core/utils/extensionContext.ts`: Extension context invalidation handling.
- `src/locales/*`: Translation files (10 languages).
- `public/contentStyle.css`: Injected CSS styles for content scripts.

---

## 10. Troubleshooting

- **Build Errors**: Clear `dist_*` folders and `node_modules`. Run `bun install`.
- **HMR Issues**: Reload the extension in `chrome://extensions`.
- **Style Conflicts**: Ensure all CSS classes are prefixed (`gv-`) or use Shadow DOM (if applicable, though this project mostly uses main DOM injection with specific classes).
- **Safari Limitations**: Some features (cloud sync, watermark removal, image export) are disabled or limited on Safari. Check `isSafari()` guards.
- **Extension Context Invalidated**: After extension update/reload, content scripts lose access to `chrome.*` APIs. Use `isExtensionContextInvalidatedError()` to handle gracefully.

---
