---
globs: ["src/core/services/StorageService.ts", "src/core/services/DataBackupService.ts", "src/core/services/GoogleDriveSyncService.ts", "src/core/services/AccountIsolationService.ts", "src/features/folder/**", "src/features/export/**"]
---

# High-Complexity Modules — Edit with Caution

| Module | Risk | Notes |
|--------|------|-------|
| `StorageService` | Sync/local/session logic + migration. Single source of truth for persistence. | Do not modify lightly. |
| `DataBackupService` | Multi-layer backup. Race conditions during unload. | Critical for data safety. |
| `GoogleDriveSyncService` | OAuth2 cloud sync (folders, prompts, starred). | Requires OAuth2 identity. |
| `AccountIsolationService` | Hard account isolation for multi-account. | Integrates with Drive sync. |
| `features/folder` | Drag-and-drop + cloud sync UI. DOM manipulation + state sync. | Watch for infinite loops. |
| `features/export` | JSON/MD/PDF/Image export + Deep Research. | Fragile to Gemini UI changes. Multi-browser compat. |

## Before modifying these modules
1. Read the entire file first — not just the section you plan to change
2. List all existing features that might be affected
3. Ensure zero destructiveness to user data
4. Run full test suite after changes
