# Folder Manager

This folder contains the implementation of the conversation folder management feature for Voyager.

## Overview

The folder manager allows users to:

- Create and manage folders and subfolders (2-level nesting)
- Drag and drop conversations from the sidebar into folders
- Move conversations between folders
- Display Gem-specific icons for different conversation types
- Navigate to conversations without page reload (SPA-style)
- Import/export folder JSON and sync folders across devices

## Change the owner of the behavior

`manager.ts` composes the Gemini owners and connects them to native menus, the floating panel,
and extension messages. Start changes at the owner below; keep the public folder-project entry
points (`ensureDataLoaded`, `getFolders`, `addConversationToFolderFromNative`) compatible.

| Responsibility                   | Entry point                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Persisted schema                 | [`core/types/folder.ts`](../../../core/types/folder.ts); local [`types.ts`](types.ts) re-exports it and defines drag data.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Pure tree operations             | [`features/folder/model/folderData.ts`](../../../features/folder/model/folderData.ts): moves, removal, ordering, integrity repair, `validateFolderData` and `cloneFolderData`. Adding or moving a conversation goes through [`placeConversations.ts`](../../../features/folder/model/placeConversations.ts) on both hosts, where callers build records and own side effects. Dropping at a position (reorder, including across folders) goes through `reorderConversations`. Shared constants live in [`features/folder/constants.ts`](../../../features/folder/constants.ts). |
| Data and commands                | [`FolderStore.ts`](FolderStore.ts): folder mutations, title/activity updates and the delegates the views call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Persistence                      | [`FolderRepository.ts`](FolderRepository.ts): load, serialized saves, draft replacement, recovery, storage echoes, account switching and scope retry, configured per platform by [`platformFolderConfig.ts`](platformFolderConfig.ts) (keys, backup namespace, root bucket, legacy migration hook, normalize/prune/recovery/retry policy). Gemini (`FolderStore`) and AI Studio (`aistudio.ts`, chrome.storage-only adapter) both use it.                                                                                                                                      |
| Account write lifetime           | [`FolderDataSession.ts`](FolderDataSession.ts): captured snapshots, queued saves, recovery namespaces and unload cleanup.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Sidebar rendering                | [`FolderSidebarView.ts`](FolderSidebarView.ts): header, search, Activity and preferences; the tree is the shared `floatingTree` mounted by [`sidebarTree.ts`](sidebarTree.ts), with drops in [`sidebarDrops.ts`](sidebarDrops.ts) and search/account filters over the cycle-cut layout in [`sidebarFilter.ts`](sidebarFilter.ts).                                                                                                                                                                                                                                              |
| Selection and drag/drop          | [`FolderSelection.ts`](FolderSelection.ts): shared native/folder selection, drag state and batch actions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Drag payloads                    | [`dragPayload.ts`](dragPayload.ts): the one validated parser for Voyager drag data; AI Studio opts into its URL fallback, Gemini stays JSON-only.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Sidebar mount and recovery       | [`FolderSidebarRuntime.ts`](FolderSidebarRuntime.ts): remounts, positioning, anchor preference and floating fallback; sidebar/anchor queries in [`sidebarMountDom.ts`](sidebarMountDom.ts), the Notebooks toggle in [`notebooksAnchorToggle.ts`](notebooksAnchorToggle.ts), recovery listeners and poll in [`sidebarRecoveryWatchers.ts`](sidebarRecoveryWatchers.ts).                                                                                                                                                                                                         |
| Conversation navigation          | [`FolderNavigation.ts`](FolderNavigation.ts): native links, SPA fallback, route highlighting and new-chat handoff.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Import/export and cloud commands | [`FolderTransferController.ts`](FolderTransferController.ts): the public entry, concurrent-operation guards and account-bound completion; the import dialog in [`folderImportDialog.ts`](folderImportDialog.ts), Drive upload/merge and tooltips in [`folderCloudSync.ts`](folderCloudSync.ts), the shared host contract in [`folderTransferHost.ts`](folderTransferHost.ts). JSON parsing/validation remains in [`FolderImportExportService.ts`](../../../features/folder/services/FolderImportExportService.ts).                                                             |
| Temporary editors and dialogs    | [`folderDialogs.ts`](folderDialogs.ts): the view registry, active create/color/menu state and close-on-remount rules; inline name editors in [`folderInlineEditors.ts`](folderInlineEditors.ts), color/move/instructions/confirmation views in [`folderDialogViews.ts`](folderDialogViews.ts).                                                                                                                                                                                                                                                                                 |
| Notifications and tooltips       | [`FolderFeedback.ts`](FolderFeedback.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Header popovers                  | [`headerMenus.ts`](headerMenus.ts): action/settings controls, delayed listeners and cleanup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Native DOM reads                 | [`nativeSidebarDom.ts`](nativeSidebarDom.ts): row lookup, presence checks and populated rows from explicit sidebar/account context; ids and URLs in [`nativeConversationIds.ts`](nativeConversationIds.ts), titles in [`nativeConversationTitles.ts`](nativeConversationTitles.ts). Which ids a stored reference answers to lives in [`features/folder/model/folderConversationIdentity.ts`](../../../features/folder/model/folderConversationIdentity.ts).                                                                                                                    |
| Native mutation scheduling       | [`NativeSidebarObserver.ts`](NativeSidebarObserver.ts): observer, frame batch, idle queue and title debounce.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Native menus and deletion        | [`NativeConversationMenus.ts`](NativeConversationMenus.ts): menu injection, confirmation identity and settlement checks; callbacks change data through the store.                                                                                                                                                                                                                                                                                                                                                                                                              |
| Browser storage                  | [`storage/FolderStorageAdapter.ts`](storage/FolderStorageAdapter.ts): Safari durable storage and Chromium mirror behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Other hosts and views            | [`aistudio.ts`](aistudio.ts) (see [AI Studio](#ai-studio)), [`floatingPanel.ts`](floatingPanel.ts); shared schema/session, separate host integration.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Gem metadata and startup         | [`gemConfig.ts`](gemConfig.ts), [`index.ts`](index.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Test data invariants and scheduling at their owner. Keep account transitions and manager wiring in
integration tests. UI tests can compose real owners with memory storage using
[`folderViewHarness.ts`](__tests__/folderViewHarness.ts). Do not pass the entire manager into a
module or add production wrappers solely to preserve a private test interface.

Account changes, sidebar remounts and destruction have different lifetimes:

- Async writes retain their original session and snapshot. Import/sync work also captures an
  activation so leaving and returning to the same account still rejects stale completion. Account
  changes clear transient editors, selection, navigation and title work before displaying new data.
- Sidebar remounts disconnect the native observer and menu panels while retaining document-level
  deletion tracking. Start that tracking before waiting for the sidebar, including floating mode.
  Pending deletion checks validate their captured storage key and route against live context.
- Disabling or destroying stops native owners and recovery work. Permanent message/settings
  listeners survive remounts and are removed only on destruction.
- Native and folder drag gestures share one selection owner. Reset clears selection; unmount also
  removes mounted toolbar listeners. Floating recovery remains distinct from explicit floating mode.

Extract only a complete responsibility with its state, setup, cleanup and behavior tests;
file length alone is not a reason to add another layer.

### AI Studio

[`aistudio.ts`](aistudio.ts) is the adapter: it binds `FolderRepository` (AI Studio config, chrome.storage
adapter) to the page and owns the three lifetimes. Account release resets the tree, dialogs and library
selection; a nav rebuild re-injects the panel; `destroy()` stops everything except the settings and
runtime-message listeners. The other modules take explicit host callbacks, never the manager.

| Responsibility                      | Module                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Folder tree, edits and drops        | [`aistudioTree.ts`](aistudioTree.ts): the shared floating tree in the nav, `aistudioTreeActions`, `placePrompt`                                 |
| Panel frame and mount               | [`aistudioPanel.ts`](aistudioPanel.ts): header actions, legacy/V2 insertion, remount watch                                                      |
| Account scope                       | [`aistudioAccountScope.ts`](aistudioAccountScope.ts): isolation setting, `/u/<n>`+email fingerprint, 1200 ms poll                               |
| Left-nav prompt history             | [`aistudioPromptHistory.ts`](aistudioPromptHistory.ts), [`aistudioPromptLinks.ts`](aistudioPromptLinks.ts): drag sources, titles, active prompt |
| /library page                       | [`aistudioLibraryPage.ts`](aistudioLibraryPage.ts) over table, selection, batch delete and drop-zone modules                                    |
| Hide archived, sidebar width        | [`aistudioHideArchived.ts`](aistudioHideArchived.ts), [`aistudioSidebarWidth.ts`](aistudioSidebarWidth.ts)                                      |
| Drive sync, import/export, messages | [`aistudioTransfer.ts`](aistudioTransfer.ts), [`aistudioImport.ts`](aistudioImport.ts)                                                          |

## Adding Support for New Gems

To add support for a new Gem (either official Google Gems or custom Gems):

1. Open `gemConfig.ts`
2. Add a new entry to the `GEM_CONFIG` array:

```typescript
{
  id: 'your-gem-id',           // The ID as it appears in URLs (/gem/your-gem-id/...)
  name: 'Your Gem Name',       // Display name
  icon: 'material_icon_name',  // Google Material Symbols icon name
}
```

### Finding the Gem ID

The Gem ID is the URL slug used by Gemini:

- Open a conversation with the Gem
- Check the URL: `https://gemini.google.com/app/gem/[GEM_ID]/...`
- Use this ID in the configuration

### Choosing an Icon

Icons should be valid [Google Material Symbols](https://fonts.google.com/icons) icon names. Common examples:

- `auto_stories` - Learning Coach
- `lightbulb` - Brainstorm Buddy
- `work` - Career Guide
- `code` - Coding Partner
- `edit_note` - Writing Editor
- `menu_book` - Storybook
- `chess` - Chess Champ
- `check_circle` - Productivity Helper
- `sports_cricket` - Cricket

### Example

```typescript
export const GEM_CONFIG: GemConfig[] = [
  // ... existing entries ...
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    icon: 'analytics',
  },
];
```

## Contributing

If you're adding support for a new official Google Gem, please submit a pull request with:

1. The new entry in `gemConfig.ts`
2. A brief description of the Gem in your PR

## Technical Details

### Gem Detection

The folder manager detects Gem conversations by analyzing the `jslog` attribute:

- **Regular conversations**: `BardVeMetadataKey:[...,[id,null,0,1]]` (4 elements)
- **Gem conversations**: `BardVeMetadataKey:[...,[id,null,0]]` (3 elements)

### URL Generation

- Regular conversations: `/app/{hex-id}`
- Gem conversations: `/gem/{gem-id}/{hex-id}`
- Multi-account support: `/u/{account-number}/...`

### AI Studio History Drag Sources

AI Studio exposes saved prompts in two shapes:

- `/library` table rows
- V2 left-nav History hover popovers rendered as body-level overlays

Both paths must populate Voyager's JSON drag payload before a prompt is dropped into a folder.
The payload includes the prompt id, title, and URL; if a browser native URL drag reaches the
folder without that JSON payload, the folder can only recover the id and must fall back to the
localized untitled label.

### Icon Mapping

The system uses a two-way mapping:

- **Gem ID → Icon**: Used when rendering conversations in folders
- **Icon → Gem ID**: Used when detecting Gem type from DOM elements

## Future Enhancements

Potential improvements that could be contributed:

- Custom user-defined Gems
- Gem icon customization
- Support for more than 2 levels of folder nesting
