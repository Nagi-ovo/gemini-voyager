---
globs:
  [
    'src/core/services/StorageService.ts',
    'src/core/services/DataBackupService.ts',
    'src/core/services/GoogleDrive*.ts',
    'src/core/services/AccountIsolationService.ts',
    'src/features/folder/**',
    'src/features/export/**',
    'src/pages/content/folder/**',
    'src/pages/content/export/**',
  ]
---

# High-Complexity Modules — Edit with Caution

| Module                                     | Risk                                                                                                                                                                | Notes                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `StorageService`                           | Typed sync/local storage wrapper used where suitable. Persistence is also handled by direct `chrome.storage`/`browser.storage` paths and migration/backup services. | Do not modify lightly.                              |
| `DataBackupService`                        | Multi-layer backup. Race conditions during unload.                                                                                                                  | Critical for data safety.                           |
| `GoogleDriveSyncService`                   | OAuth2 cloud sync: folders, prompts, settings, plugins, starred, forks, timeline hierarchy and highlights, scoped per account. Split across `GoogleDrive*.ts`.        | Requires OAuth2 identity.                           |
| `AccountIsolationService`                  | Hard account isolation for multi-account.                                                                                                                           | Integrates with Drive sync.                         |
| `features/folder` + `pages/content/folder` | Drag-and-drop + cloud sync UI. DOM manipulation + state sync.                                                                                                       | Watch for infinite loops.                           |
| `features/export` + `pages/content/export` | JSON/MD/PDF/Image export + Deep Research.                                                                                                                           | Fragile to host UI changes. Multi-browser compat.   |

## Changes to behavior or data

Apply these checks when changing logic, serialized formats, account scope, or data handling in these modules. Comments, documentation, and formatting-only changes use the prose/formatting checks in `AGENTS.md`.

1. Read the entire file first — not just the section you plan to change
2. List all existing features that might be affected
3. Ensure zero destructiveness to user data
4. Run the full test suite after changes; reuse that result if a later verification step checks the same unchanged inputs
