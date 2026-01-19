# CLAUDE.md - AI Assistant Guide for Gemini Voyager

<!--
This file is generated from AI_GUIDE.template.md.
Do not edit directly; update the template and run `node scripts/generate-ai-guides.js`.
-->

> **Last Updated**: 2025-11-20
> **Version**: 0.9.6
> **Purpose**: Comprehensive guide for AI assistants working with the Gemini Voyager codebase

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Architecture & Design Patterns](#architecture--design-patterns)
4. [Development Workflows](#development-workflows)
5. [Key Conventions](#key-conventions)
6. [Testing Strategy](#testing-strategy)
7. [Common Tasks](#common-tasks)
8. [Important Files Reference](#important-files-reference)
9. [Troubleshooting](#troubleshooting)

---

## Project Overview

### What is Gemini Voyager?

Gemini Voyager is a cross-browser extension that enhances the Google Gemini AI chat experience with:

- **Timeline Navigation**: Visual conversation timeline with clickable nodes, scroll-sync, and starred messages
- **Folder Organization**: Two-level drag-and-drop folder system for conversation management
- **Prompt Library**: Tag-based prompt management with import/export
- **Chat Export**: Export conversations to JSON, Markdown, or PDF with asset packaging
- **Formula Copy**: One-click LaTeX/KaTeX formula source copying
- **UI Customization**: Adjustable chat width, sidebar width, dark mode, multi-language support (EN/ZH)
- **Auto-Backup**: Automatic timestamped backups with File System Access API or JSZip fallback

### Tech Stack

- **Framework**: React 19.1.0 with TypeScript 5.8.3
- **Build Tool**: Vite 7.1.11 with CRXJS plugin (Manifest V3)
- **Styling**: Tailwind CSS 4.1.15 with dark mode support
- **Testing**: Vitest 4.0.6 with jsdom environment
- **Package Manager**: Bun (recommended) or pnpm/npm
- **Target Browsers**: Chrome, Firefox, Safari, Edge, Opera, Brave

### Browser Extension Architecture

**Entry Points**:
- **Background Service Worker** (`src/pages/background/`) - Image fetching, popup management
- **Content Scripts** (`src/pages/content/`) - DOM manipulation on Gemini/AI Studio
- **Popup** (`src/pages/popup/`) - Extension settings UI
- **DevTools, Options, Panel** - Placeholder pages for future features

**Permissions**:
- `storage` - Persistent settings (synced across devices)
- Host permissions for `gemini.google.com` and `aistudio.google.com`
- Cross-origin image fetching from Google CDN domains

---

## Repository Structure

```
gemini-voyager/
├── src/                          # Main source code
│   ├── pages/                    # Extension entry points
│   │   ├── background/           # Service worker (image fetch, popup)
│   │   ├── content/              # Content scripts (main features)
│   │   │   ├── timeline/         # Timeline navigation
│   │   │   ├── folder/           # Folder organization
│   │   │   ├── prompt/           # Prompt library
│   │   │   ├── chatWidth/        # Chat width adjuster
│   │   │   ├── sidebarWidth/     # Sidebar width adjuster
│   │   │   ├── editInputWidth/   # Edit input width adjuster
│   │   │   └── formulaCopy/      # LaTeX formula copying
│   │   ├── popup/                # Extension popup UI
│   │   ├── options/              # Options page (placeholder)
│   │   ├── panel/                # Side panel (placeholder)
│   │   └── devtools/             # DevTools page (placeholder)
│   ├── core/                     # Core business logic
│   │   ├── services/             # StorageService, LoggerService, DOMService, DataBackupService, StorageMonitor
│   │   ├── types/                # TypeScript type definitions
│   │   ├── errors/               # Custom error classes
│   │   └── utils/                # Utility functions (concurrency, storageMigration, etc.)
│   ├── features/                 # Shared feature modules
│   │   ├── export/               # Chat export (JSON, MD, PDF)
│   │   ├── folder/               # Folder system logic
│   │   ├── formulaCopy/          # Formula copy logic
│   │   └── backup/               # Auto-backup with File System API
│   ├── components/               # React UI components
│   │   └── ui/                   # Reusable primitives (Button, Card, etc.)
│   ├── hooks/                    # Custom React hooks
│   ├── contexts/                 # React context providers
│   ├── locales/                  # i18n translations (en, zh)
│   ├── assets/                   # Images and styles
│   ├── lib/                      # Third-party utilities
│   ├── utils/                    # Shared utilities
│   └── tests/                    # Global test setup (setup.ts)
├── public/                       # Static assets (icons, CSS)
├── scripts/                      # Build scripts (Safari)
├── safari/                       # Safari-specific code
├── docs/                         # VitePress documentation
├── .github/                      # GitHub workflows, docs, templates
├── vite.config.*.ts             # Build configs (base, chrome, firefox, safari)
├── manifest.json                # Production manifest (MV3)
├── manifest.dev.json            # Development manifest overrides
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── vitest.config.ts             # Testing configuration
├── custom-vite-plugins.ts       # Custom Vite plugins
├── CLAUDE.md                    # AI assistant guide (this file)
└── TESTING_GUIDE.md             # Data loss prevention testing guide
```

### Key Directories Explained

| Directory | Purpose | When to Modify |
|-----------|---------|----------------|
| `src/pages/content/` | Content scripts injected into Gemini/AI Studio | Adding/modifying features visible on the Gemini site |
| `src/core/services/` | Business logic services (storage, logging, DOM, backup, monitoring) | Changing storage strategy, logging behavior, backup mechanism, quota monitoring |
| `src/core/types/` | TypeScript type definitions | Adding new data structures |
| `src/features/export/` | Multi-format export functionality | Changing export formats or behavior |
| `src/features/backup/` | Auto-backup with File System API/JSZip fallback | Changing backup strategy, adding backup targets |
| `src/components/ui/` | Reusable UI components | Adding new UI primitives |
| `src/hooks/` | Custom React hooks | Adding reusable stateful logic |
| `src/locales/` | Translation files | Adding new languages or updating text |
| `public/` | Static assets (icons, CSS) | Updating extension icons or global styles |

---

## Architecture & Design Patterns

### Design Patterns Used

1. **Service Pattern**
   - `StorageService`, `LoggerService`, `DOMService`, `DataBackupService`, `StorageMonitor` - Centralized business logic
   - Singleton instances with factory methods
   - Example: `src/core/services/StorageService.ts`

2. **Strategy Pattern**
   - Export formatters: `JSONFormatter`, `MarkdownFormatter`, `PDFPrintService`
   - Location: `src/features/export/`

3. **Repository Pattern**
   - Abstracted storage access via `StorageService`
   - Multiple implementations: `ChromeStorageService`, `ChromeLocalStorageService`, `LocalStorageService`

4. **Observer Pattern**
   - `MutationObserver` for DOM change detection
   - Used in timeline, folder manager, and formula copy features

5. **Singleton Pattern**
   - Logger and Storage services
   - Ensures single source of truth

6. **Async Lock Pattern**
   - `AsyncLock` class prevents race conditions during import/export
   - Location: `src/core/utils/concurrency.ts`

### Type Safety with Brand Types

The codebase uses branded types for compile-time ID safety:

```typescript
type ConversationId = Brand<string, 'ConversationId'>
type FolderId = Brand<string, 'FolderId'>
type TurnId = Brand<string, 'TurnId'>
```

**Rule**: Always use branded constructors when creating IDs:
- `conversationId('abc123')` ✓
- `'abc123' as ConversationId` ✗

### Error Handling Strategy

Custom error hierarchy with context preservation:

```typescript
AppError
├── StorageError (code: STORAGE_ERROR)
├── ValidationError (code: VALIDATION_ERROR)
├── ExportError (code: EXPORT_ERROR)
└── ImportError (code: IMPORT_ERROR)
```

**Best Practices**:
- Always use custom error classes, not generic `Error`
- Provide context via `context` object
- Distinguish recoverable vs. unrecoverable errors
- Preserve stack traces

**Example**:
```typescript
throw new StorageError('Failed to save folder data', {
  context: { folderId, operation: 'save' },
  recoverable: true,
  originalError: error
});
```

### Storage Architecture

**Factory Pattern**: Automatically selects appropriate storage implementation

```typescript
const storage = await createStorageService(); // Auto-selects implementation
```

**Storage Implementations**:
- **ChromeStorageService**: `chrome.storage.sync` for settings (100KB quota, cross-device sync)
- **ChromeLocalStorageService**: `chrome.storage.local` for large data (5-10MB quota, per-device)
- **LocalStorageService**: Fallback using browser `localStorage`

**Storage Strategy**:
- **Sync Storage** (`chrome.storage.sync`): UI preferences, settings (language, width, positions)
- **Local Storage** (`chrome.storage.local`): Large data like prompts (shared across gemini.google.com and aistudio.google.com)
- **localStorage** (browser): Multi-layer backup system via `DataBackupService`

**Storage Keys**: Centralized in `src/core/types/common.ts` (`StorageKeys` object)
- `FOLDER_DATA` (`gvFolderData`) - Folder structure (Gemini)
- `FOLDER_DATA_AISTUDIO` (`gvFolderDataAIStudio`) - Folder structure (AI Studio)
- `TIMELINE_SCROLL_MODE` (`geminiTimelineScrollMode`) - Timeline scroll mode setting
- `TIMELINE_HIDE_CONTAINER` (`geminiTimelineHideContainer`) - Timeline visibility setting
- `TIMELINE_DRAGGABLE` (`geminiTimelineDraggable`) - Timeline draggable state
- `TIMELINE_POSITION` (`geminiTimelinePosition`) - Timeline position coordinates
- `CHAT_WIDTH` (`geminiChatWidth`) - Chat container width
- `PROMPT_ITEMS` (`gvPromptItems`) - Prompt library data
- `PROMPT_PANEL_LOCKED` (`gvPromptPanelLocked`) - Prompt panel lock state
- `PROMPT_PANEL_POSITION` (`gvPromptPanelPosition`) - Prompt panel position
- `PROMPT_TRIGGER_POSITION` (`gvPromptTriggerPosition`) - Prompt trigger position
- `LANGUAGE` (`language`) - UI language preference

**Note**: Some features still use storage keys not in the central `StorageKeys` object:
- Sidebar Width: `geminiSidebarWidth` (not centralized yet)
- Backup Service: `gvBackupConfig` (defined in `src/features/backup/types/backup.ts`)

**Data Protection Features**:
1. **DataBackupService** (`src/core/services/DataBackupService.ts`)
   - Multi-layer localStorage backup (primary, emergency, beforeUnload)
   - Timestamp validation (7-day expiry)
   - Automatic page unload backup
   - Recovery priority: primary → emergency → beforeUnload → in-memory

2. **StorageMonitor** (`src/core/services/StorageMonitor.ts`)
   - Proactive storage quota monitoring
   - Multi-level warnings (80%, 90%, 95%)
   - User notifications with usage details
   - Configurable check intervals

3. **Storage Migration** (`src/core/utils/storageMigration.ts`)
   - Automatic migration from localStorage to chrome.storage.local
   - Non-destructive (preserves localStorage as backup)
   - Idempotent migration (skips already-migrated keys)

**Concurrency**: Uses `AsyncLock` to prevent race conditions during import/export operations

---

## Development Workflows

### Initial Setup

```bash
# Prerequisites: Node 20+, Bun 10+ (or pnpm/npm)
bun install              # Install dependencies
bun run dev:chrome       # Start dev mode for Chrome
bun run dev:firefox      # Start dev mode for Firefox
bun run dev:safari       # Start dev mode for Safari (macOS only)
```

### Pre-Commit Checklist

Before submitting PRs, always run:

```bash
bun run lint             # ESLint auto-fix
bun run typecheck        # TypeScript type checking
bun run build            # Production build test
bun run test             # Run test suite
```

### Build Commands

```bash
# Development builds (with auto-reload)
bun run dev              # Chrome (default)
bun run dev:chrome       # Chrome explicitly
bun run dev:firefox      # Firefox
bun run dev:safari       # Safari (macOS only)

# Production builds
bun run build            # Chrome (default)
bun run build:chrome     # Chrome explicitly
bun run build:firefox    # Firefox
bun run build:safari     # Safari
bun run build:all        # All browsers
```

**Output directories**:
- Chrome: `dist_chrome/`
- Firefox: `dist_firefox/`
- Safari: `dist_safari/`

### Development Mode

Uses **Nodemon** for hot reload:
- Changes to source files trigger automatic rebuild
- Content scripts reload automatically
- Background service worker restarts on change

**Configuration**: `nodemon.chrome.json`, `nodemon.firefox.json`, `nodemon.safari.json`

### Git Workflow

1. Create feature branch: `git checkout -b feature/your-feature-name`
2. Make focused, small changes
3. Write clear commit messages
4. Run pre-commit checks
5. Submit PR with user impact description

**Commit Message Format**: Follow conventional commits
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring

---

## Key Conventions

### Naming Conventions

#### Files & Directories

| Pattern | Purpose | Example |
|---------|---------|---------|
| `*Service.ts` | Business logic services | `StorageService.ts` |
| `*Manager.ts` | DOM manipulation managers | `FolderManager.ts` |
| `use*.ts` | React hooks | `useDarkMode.ts` |
| `*Context.tsx` | React context providers | `LanguageContext.tsx` |
| `index.ts` | Module entry points | `src/pages/content/index.tsx` |
| `*.test.ts` | Test files | `StorageService.test.ts` |
| `types.ts` | Type definition files | `src/core/types/common.ts` |

#### CSS Classes

**Namespacing**: All extension styles use `gv-` prefix to avoid conflicts

```css
.gv-hidden              /* Utility classes */
.gv-locked              /* State classes */
.gv-pm-*                /* Prompt manager (pm) components */
.gemini-timeline-*      /* Timeline components */
```

**Tailwind Classes**: Use `cn()` helper for conditional classes

```typescript
import { cn } from '@/lib/utils';

<div className={cn(
  'base-class',
  isDark && 'dark-mode-class',
  'conditional-class'
)} />
```

#### TypeScript Conventions

- **PascalCase**: Classes, interfaces, types, enums, React components
- **camelCase**: Functions, variables, methods
- **UPPER_SNAKE_CASE**: Constants, storage keys
- **kebab-case**: CSS classes, file names (optional)

**Examples**:
```typescript
// Types & Interfaces
type FolderId = Brand<string, 'FolderId'>
interface FolderData { ... }

// Constants
const STORAGE_KEY_FOLDER_DATA = 'gvFolderData';

// Functions
function createFolderId(id: string): FolderId { ... }

// Components
export function FolderManager() { ... }
```

### Code Style

#### Prefer Early Returns

```typescript
// Good ✓
function processFolder(folder: Folder | null) {
  if (!folder) return;
  if (!folder.isActive) return;

  // Main logic here
  performAction(folder);
}

// Bad ✗
function processFolder(folder: Folder | null) {
  if (folder && folder.isActive) {
    performAction(folder);
  }
}
```

#### Use Descriptive Names

```typescript
// Good ✓
const activeFolderIds = folders.filter(f => f.isActive).map(f => f.id);

// Bad ✗
const arr = folders.filter(f => f.isActive).map(f => f.id);
```

#### Avoid Magic Numbers/Strings

```typescript
// Good ✓
const POLL_INTERVAL_MS = 1000;
const MAX_RETRY_ATTEMPTS = 3;

// Bad ✗
setTimeout(poll, 1000);
for (let i = 0; i < 3; i++) { retry(); }
```

### Import Order

1. React & React-related imports
2. Third-party libraries
3. Internal absolute imports (`@/...`)
4. Relative imports (`./...`)
5. Type-only imports (last)

**Example**:
```typescript
import React, { useState, useEffect } from 'react';
import { marked } from 'marked';

import { StorageService } from '@/core/services/StorageService';
import { Button } from '@/components/ui/Button';

import { parseConversation } from './parser';

import type { FolderData } from '@/core/types/folder';
```

### TypeScript Path Aliases

Configured in `tsconfig.json`:

```typescript
import { StorageService } from '@/core/services/StorageService';  // ✓
import { Button } from '@/components/ui/Button';                  // ✓
import { cn } from '@/lib/utils';                                 // ✓
```

**Available aliases**:
- `@/*` → `src/*` (most commonly used)
- `@/core` → `src/core`
- `@/core/*` → `src/core/*`
- `@/features/*` → `src/features/*`
- `@/components/*` → `src/components/*`
- `@/lib/*` → `src/lib/*`
- `@assets/*` → `src/assets/*`
- `@pages/*` → `src/pages/*`
- `@locales/*` → `src/locales/*`

**Note**: `@src/*` is defined in tsconfig.json but not used in practice. Use `@/*` instead.

---

## Testing Strategy

### Test Stack

- **Framework**: Vitest 4.0.6
- **Environment**: jsdom (simulates browser DOM)
- **Coverage**: v8 provider with HTML reports
- **Mocks**: Chrome API, localStorage, matchMedia

### Running Tests

```bash
bun run test              # Run once
bun run test:watch        # Watch mode
bun run test:ui           # Interactive UI
bun run test:coverage     # Generate coverage report
```

### Test File Location

**Primary Pattern**: Tests are colocated with source code in `__tests__/` directories within each module:

```
src/core/services/
├── StorageService.ts
└── __tests__/
    └── StorageService.test.ts

src/features/export/services/
├── MarkdownFormatter.ts
└── __tests__/
    └── MarkdownFormatter.test.ts
```

**Test Configuration**: Global test setup and mocks are in `src/tests/setup.ts`

### Writing Tests

**Test Structure**:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('FeatureName', () => {
  beforeEach(() => {
    // Setup
  });

  it('should handle success case', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = processInput(input);

    // Assert
    expect(result).toBe('expected');
  });

  it('should handle error case', () => {
    expect(() => processInput(null)).toThrow();
  });
});
```

### Mocking Chrome APIs

Chrome APIs are mocked in `src/tests/setup.ts`:

```typescript
globalThis.chrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  runtime: {
    lastError: null,
  },
} as any;
```

### Coverage Goals

- **Services**: 80%+ coverage
- **Utilities**: 90%+ coverage
- **Components**: 70%+ coverage (UI components may have lower coverage)

---

## Common Tasks

### Adding a New Feature

1. **Create feature directory**: `src/pages/content/your-feature/`
2. **Implement feature logic**: `YourFeatureManager.ts`
3. **Add types**: `types.ts` in feature directory or `src/core/types/`
4. **Register in content script**: `src/pages/content/index.tsx`
5. **Add storage keys** (if needed): `src/core/services/StorageService.ts`
6. **Add translations**: `src/locales/en/messages.json`, `src/locales/zh/messages.json`
7. **Write tests**: Create `__tests__/` directory in feature folder
8. **Update manifest** (if permissions needed): `manifest.json`

**Example**:
```typescript
// src/pages/content/index.tsx
import { YourFeatureManager } from './your-feature/manager';

if (isGeminiSite()) {
  const yourFeature = new YourFeatureManager();
  yourFeature.init();
}
```

### Adding a New Gem Configuration

Gems are special AI assistants in Gemini. To add support for a new Gem:

1. Open `src/pages/content/folder/gemConfig.ts`
2. Add new entry to `GEM_CONFIG` array:

```typescript
{
  id: 'your-gem-id',           // From URL: /gem/your-gem-id/...
  name: 'Your Gem Name',       // Display name
  icon: 'material_icon_name',  // Google Material Symbols icon
}
```

3. Find icon names at [Google Material Symbols](https://fonts.google.com/icons)

### Adding a New UI Component

1. Create component in `src/components/ui/` or feature directory
2. Use **class-variance-authority (CVA)** for variants:

```typescript
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'base-classes',
  {
    variants: {
      variant: {
        default: 'default-classes',
        outline: 'outline-classes',
      },
      size: {
        sm: 'small-classes',
        lg: 'large-classes',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
```

### Adding a New Translation

1. Add key to `src/locales/en/messages.json`:
```json
{
  "yourFeature_title": {
    "message": "Your Feature Title"
  }
}
```

2. Add Chinese translation to `src/locales/zh/messages.json`:
```json
{
  "yourFeature_title": {
    "message": "您的功能标题"
  }
}
```

3. Use in code:
```typescript
import { useI18n } from '@/hooks/useI18n';

function YourComponent() {
  const t = useI18n();
  return <h1>{t('yourFeature_title')}</h1>;
}
```

### Modifying Export Formats

Export functionality is in `src/features/export/`:

- **JSON Export**: `ConversationExportService.ts` → `toJSON()` method
- **Markdown Export**: `MarkdownFormatter.ts` → `format()` method
- **PDF Export**: `PDFPrintService.ts` → `print()` method

**Example**: Adding a new field to JSON export:

```typescript
// src/features/export/ConversationExportService.ts
private toJSON(data: ConversationData): string {
  const exportData = {
    format: 'gemini-voyager.chat.v1',
    url: data.url,
    exportedAt: new Date().toISOString(),
    count: data.items.length,
    yourNewField: 'value',  // Add new field here
    items: data.items,
  };
  return JSON.stringify(exportData, null, 2);
}
```

### Adding Storage Keys

1. Define constant in `src/core/services/StorageService.ts`:
```typescript
const STORAGE_KEY_YOUR_FEATURE = 'gvYourFeature';
```

2. Add getter/setter methods:
```typescript
async getYourFeatureData(): Promise<YourData | null> {
  return this.get<YourData>(STORAGE_KEY_YOUR_FEATURE);
}

async setYourFeatureData(data: YourData): Promise<void> {
  return this.set(STORAGE_KEY_YOUR_FEATURE, data);
}
```

### Working with Backup Service

The backup service (`src/features/backup/`) provides automatic timestamped backups with File System Access API:

**Key Features**:
- Automatic backups at configurable intervals
- Manual backup triggering
- Backs up prompts and folder data
- JSZip fallback for browsers without File System Access API support

**Example Usage**:
```typescript
import { BackupService, backupService } from '@/features/backup/services/BackupService';

// Request directory access
const dirHandle = await BackupService.requestDirectoryAccess();
if (!dirHandle) {
  console.log('User cancelled directory selection');
  return;
}

// Create backup
const config = {
  enabled: true,
  intervalHours: 24,
  includePrompts: true,
  includeFolders: true,
};

const result = await backupService.createBackup(dirHandle, config);
if (result.success) {
  console.log(`Backup created: ${result.data.promptCount} prompts, ${result.data.folderCount} folders`);
}
```

**Backup Structure**:
- Each backup creates a timestamped folder: `backup-YYYYMMDD-HHMMSS/`
- Contains: `prompts.json`, `folders.json`, `metadata.json`

### Handling Browser-Specific Code

Use feature detection instead of browser detection:

```typescript
// Good ✓
if (typeof browser !== 'undefined') {
  // Firefox-specific code (webextension-polyfill)
} else {
  // Chrome-specific code
}

// Bad ✗
if (userAgent.includes('Firefox')) {
  // Browser detection is brittle
}
```

For manifest differences, use separate configs:
- `vite.config.chrome.ts` - Chrome manifest
- `vite.config.firefox.ts` - Firefox manifest with `browser_specific_settings`
- `vite.config.safari.ts` - Safari manifest

---

## Important Files Reference

### Configuration Files

| File | Purpose | When to Modify |
|------|---------|----------------|
| `manifest.json` | Production extension manifest (MV3) | Adding permissions, content scripts, icons |
| `manifest.dev.json` | Development manifest overrides | Adding dev-only features |
| `package.json` | Dependencies, scripts, metadata | Adding packages, changing scripts |
| `tsconfig.json` | TypeScript compiler options | Adding path aliases, changing target |
| `vite.config.*.ts` | Build configuration per browser | Changing build output, plugins |
| `vitest.config.ts` | Testing configuration | Changing test environment, coverage |
| `eslint.config.js` | Linting rules | Adding/modifying lint rules |
| `.prettierrc` | Code formatting rules | Changing formatting preferences |

### Core Source Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/pages/content/index.tsx` | Content script orchestrator | Feature initialization |
| `src/core/services/StorageService.ts` | Storage abstraction with sync/local support | `createStorageService()`, `ChromeLocalStorageService` |
| `src/core/services/DataBackupService.ts` | Multi-layer localStorage backup system | `DataBackupService`, backup/recovery methods |
| `src/core/services/StorageMonitor.ts` | Storage quota monitoring with warnings | `StorageMonitor`, `startMonitoring()` |
| `src/core/services/LoggerService.ts` | Centralized logging | `logger.info()`, `logger.error()` |
| `src/core/types/common.ts` | Shared type definitions and storage keys | Brand types, `StorageKeys` object |
| `src/core/utils/storageMigration.ts` | Auto-migration from localStorage | `migrateToExtensionStorage()` |
| `src/core/errors/index.ts` | Error classes | `AppError`, `StorageError`, etc. |
| `src/features/export/ConversationExportService.ts` | Chat export logic | `exportConversation()` |
| `src/features/backup/services/BackupService.ts` | Auto-backup with File System API | `backupService`, `createBackup()` |
| `src/features/backup/services/PromptImportExportService.ts` | Prompt backup/restore | Export/import prompt library |
| `src/pages/popup/Popup.tsx` | Extension popup UI | Main popup component |
| `src/hooks/useI18n.ts` | Internationalization hook | `useI18n()` |
| `src/contexts/LanguageContext.tsx` | Language state management | `LanguageProvider`, `useLanguage()` |

### Build & Tooling Files

| File | Purpose |
|------|---------|
| `custom-vite-plugins.ts` | Custom Vite plugins (i18n, icon stripping) |
| `nodemon.*.json` | Hot reload configuration for dev mode |
| `scripts/build-safari.ts` | Safari-specific build script |
| `TESTING_GUIDE.md` | Comprehensive testing guide for data loss prevention features |
| `.github/workflows/` | CI/CD workflows for documentation deployment |

### Documentation Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | AI assistant guide (this file) |
| `README.md` | Main user-facing documentation |
| `TESTING_GUIDE.md` | Testing guide for data protection features |
| `docs/` | VitePress documentation site |
| `.github/CONTRIBUTING.md` | Contribution guidelines |
| `.github/docs/safari/INSTALLATION.md` | Safari installation guide |
| `.github/docs/IMPORT_EXPORT_GUIDE.md` | Data portability guide |
| `.github/README_ZH.md` | Chinese documentation |

---

## Troubleshooting

### Common Issues

#### 1. Content Script Not Loading

**Symptoms**: Features don't appear on Gemini site

**Diagnosis**:
```bash
# Check if content script is registered in manifest
cat manifest.json | grep -A 5 "content_scripts"

# Verify Vite build output
ls -la dist_chrome/src/pages/content/
```

**Solutions**:
- Ensure `manifest.json` includes correct `matches` patterns
- Check browser console for errors (F12 → Console)
- Verify content script is built in `dist_*/src/pages/content/index.js`
- Reload extension in `chrome://extensions`

#### 2. Storage Not Persisting

**Symptoms**: Settings reset on browser restart

**Diagnosis**:
```typescript
// Add debug logging
const storage = await createStorageService();
console.log('Storage type:', storage.constructor.name);

const data = await storage.getFolderData();
console.log('Loaded data:', data);
```

**Solutions**:
- Check if `storage` permission is in `manifest.json`
- Verify Chrome Storage quota (Chrome uses 100KB sync storage limit)
- Check if fallback to LocalStorage is occurring
- Clear storage and retry: `chrome.storage.sync.clear()`

#### 3. Build Failures

**Symptoms**: `bun run build` fails with errors

**Common Causes**:
- TypeScript errors: Run `bun run typecheck` first
- Missing dependencies: Run `bun install`
- Vite plugin errors: Check `vite.config.*.ts` and `custom-vite-plugins.ts`

**Solutions**:
```bash
# Clean build artifacts
rm -rf dist_chrome/ dist_firefox/ dist_safari/

# Reinstall dependencies
rm -rf node_modules/ bun.lock
bun install

# Rebuild
bun run build
```

#### 4. Tests Failing

**Symptoms**: `bun run test` shows failures

**Diagnosis**:
```bash
# Run specific test file
bun run test src/core/services/__tests__/StorageService.test.ts

# Enable verbose logging
bun run test --reporter=verbose

# Check coverage
bun run test:coverage
```

**Solutions**:
- Update test mocks in `src/tests/setup.ts`
- Ensure Chrome API mocks match actual usage
- Check for async timing issues (use `await` in tests)

#### 5. Import Path Errors

**Symptoms**: `Cannot find module '@/core/...'`

**Solution**: Ensure path aliases are configured in:
- `tsconfig.json` → `compilerOptions.paths`
- `vite.config.base.ts` → `vite-tsconfig-paths` plugin
- `vitest.config.ts` → `resolve.alias`

#### 6. Dark Mode Not Working

**Symptoms**: Dark mode toggle doesn't change colors

**Diagnosis**:
```typescript
// Check if dark mode class is applied
document.documentElement.classList.contains('dark')

// Check CSS variable values
getComputedStyle(document.documentElement).getPropertyValue('--background')
```

**Solutions**:
- Verify `useDarkMode` hook is called in component
- Check if Tailwind dark mode is configured (`tailwind.config.ts`)
- Ensure CSS variables are defined in `public/global.css`

### Debugging Tips

1. **Content Script Debugging**:
   - Open Gemini site
   - Press F12 → Console
   - Look for `[Gemini Voyager]` prefixed logs
   - Check Network tab for failed resource loads

2. **Background Script Debugging**:
   - Go to `chrome://extensions`
   - Find Gemini Voyager
   - Click "Inspect views: service worker"
   - Check console for background script logs

3. **Popup Debugging**:
   - Right-click extension icon → Inspect popup
   - Console shows popup script logs

4. **Storage Debugging**:
   ```javascript
   // In browser console
   chrome.storage.sync.get(null, (data) => console.log(data));
   ```

5. **React DevTools**:
   - Install React DevTools extension
   - Inspect component tree and state
   - Monitor re-renders and performance

### Performance Optimization

1. **Reduce MutationObserver Overhead**:
   - Use `throttle()` or `debounce()` for frequent DOM changes
   - Disconnect observers when not needed
   - Use specific target nodes instead of `document.body`

2. **Optimize Storage Reads**:
   - Batch reads into single `get()` call
   - Cache frequently accessed data in memory
   - Use `AsyncLock` to prevent redundant reads

3. **Minimize Content Script Size**:
   - Use dynamic imports for large features
   - Tree-shake unused code
   - Check bundle size: `du -h dist_chrome/src/pages/content/index.js`

4. **Lazy Load Components**:
   ```typescript
   const HeavyComponent = lazy(() => import('./HeavyComponent'));
   ```

---

## Project Scope & Boundaries

### In Scope

- Timeline visualization for Gemini conversations
- Folder organization for Gemini and AI Studio
- Prompt library management
- Chat export to JSON/Markdown/PDF
- UI customization (width, dark mode, i18n)
- Formula copying for LaTeX/KaTeX

### Out of Scope

- **Site scraping** - No automated data extraction
- **Network interception** - No request/response modification
- **Account automation** - No auto-login, auto-send, etc.
- **Content injection** - No ads, tracking, or third-party content
- **Gemini API calls** - Extension only enhances existing UI

### Contribution Guidelines

- Keep changes **focused and small** (single responsibility)
- Explain **user impact** in PR descriptions
- Match **existing code style** (readability over cleverness)
- Add **tests** for new features
- Update **documentation** and translations
- Run **pre-commit checks** before submitting

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for detailed guidelines.

---

## Additional Resources

### Documentation

- [Main README](README.md) - User-facing documentation
- [VitePress Documentation](docs/) - Interactive documentation site (deployed via GitHub workflows)
- [Testing Guide](TESTING_GUIDE.md) - Comprehensive testing guide for data loss prevention
- [Contributing Guide](.github/CONTRIBUTING.md) - Contribution guidelines
- [Safari Installation](.github/docs/safari/INSTALLATION.md) - Safari setup
- [Import/Export Guide](.github/docs/IMPORT_EXPORT_GUIDE.md) - Data portability
- [Chinese README](.github/README_ZH.md) - 中文说明

### External References

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration](https://developer.chrome.com/docs/extensions/migrating/)
- [React 19 Docs](https://react.dev/)
- [Vite Docs](https://vitejs.dev/)
- [Tailwind CSS Docs](https://tailwindcss.com/)
- [Vitest Docs](https://vitest.dev/)

### Community

- [GitHub Issues](https://github.com/Nagi-ovo/gemini-voyager/issues) - Bug reports, feature requests
- [GitHub Discussions](https://github.com/Nagi-ovo/gemini-voyager/discussions) - Community support
- [DeepWiki](https://deepwiki.com/Nagi-ovo/gemini-voyager) - AI-assisted codebase exploration

---

## Changelog

### v0.9.6 (Latest)
- **Data Loss Prevention**: Implemented robust localStorage-based backup system to prevent data loss during network errors and page refreshes
- **Storage Monitoring**: Added proactive storage quota monitoring with multi-level warnings (80%, 90%, 95%)
- **Cross-Domain Prompts**: Migrated Prompt Manager to chrome.storage.local for sharing between gemini.google.com and aistudio.google.com
- **Data Recovery**: Enhanced AIStudio folder manager with three-tier data recovery mechanism (sessionStorage → in-memory → empty state)
- **New Services**:
  - `DataBackupService`: Multi-layer backup with automatic page unload protection
  - `StorageMonitor`: Real-time storage quota monitoring with user notifications
  - `ChromeLocalStorageService`: Large data storage support (5-10MB quota)
- **Migration Utilities**: Automatic one-time migration from localStorage to chrome.storage.local
- **Documentation**: Added comprehensive TESTING_GUIDE.md for data loss prevention features
- **Bug Fixes**: Fixed sessionStorage recovery issues and improved data reliability

### v0.9.5
- Added configurable sidebar width setting
- Fixed abnormal line spacing of dialog items within folder
- Fixed 10px right padding overlap issue between chat scroll and timeline

### v0.9.4
- Added jszip fallback for browsers like Safari and Firefox that don't support File System Access API
- Improved backup compatibility across browsers

### v0.9.3
- Added automatic backup with timestamp feature
- Fixed hide archived setting not applying to conversations after page refresh
- Fixed folder records being cleared unexpectedly

### v0.9.2
- Added folder close option to popup
- Fixed folder list sorting in Move to Folder
- Fixed conversations lost when added to empty folders bug
- Updated license info format in READMEs

### Previous Versions
See [commit history](https://github.com/Nagi-ovo/gemini-voyager/commits/main) for detailed changelog.

---

## License

MIT License © 2025 Jesse Zhang

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

---

**Last Updated**: 2025-11-20
**Maintainer**: Jesse Zhang (@Nagi-ovo)
**For Questions**: Open an issue on [GitHub](https://github.com/Nagi-ovo/gemini-voyager/issues)