# AI Studio folders

AI Studio's folders run as the official `voyager.aistudio-folders` plugin over a session the page
holds. [`session/aistudioFolderSession.ts`](../../../../../pages/content/folder/session/aistudioFolderSession.ts) is the data half: it
binds `FolderRepository` (AI Studio config, chrome.storage adapter) to the page, runs the sync → local
migration, the account scope and the popup's cloud-sync answers, and owns the commands. The content
script's start point ([`aistudioFolderStartup.ts`](../../../../../pages/content/aistudioFolderStartup.ts)) holds it for the
page's lifetime through [`session/aistudioFolderSessions.ts`](../../../../../pages/content/folder/session/aistudioFolderSessions.ts), so
it outlives the plugin. The folders primitive's AI Studio runtime (this folder, entered from [`activate.ts`](activate.ts)) attaches a view while
the plugin runs: account release resets the tree, dialogs and library selection; a nav rebuild
re-injects the panel; turning the plugin off removes every view effect and suspends edits and the
account poll, keeping the storage and message listeners.

| Responsibility                      | Module                                                                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Folder tree, edits and drops        | [`tree.ts`](tree.ts): the tree's AI Studio look and `aistudioTreeActions`; edits in `features/folder/sites/aistudioEdits.ts`                                                                                            |
| Panel frame and mount               | [`panel.ts`](panel.ts) over the folder section's panel mode ([`panelSection.ts`](../panelSection.ts)): header, legacy/V2 insertion, remount                                                                             |
| Page view while the plugin runs     | [`view.ts`](view.ts); in-app routes in [`routes.ts`](routes.ts)                                                                                                                                                         |
| Account scope                       | [`aistudioAccountScope.ts`](../../../../../pages/content/folder/aistudioAccountScope.ts): isolation setting, `/u/<n>`+email fingerprint, 1200 ms poll                                                                   |
| Left-nav prompt history             | [`aistudioPromptHistory.ts`](../../../../../pages/content/folder/aistudioPromptHistory.ts), [`aistudioPromptLinks.ts`](../../../../../pages/content/folder/aistudioPromptLinks.ts): drag sources, titles, active prompt |
| /library page                       | [`aistudioLibraryPage.ts`](../../../../../pages/content/folder/aistudioLibraryPage.ts) over table, selection, batch delete and drop-zone modules                                                                        |
| Hide archived                       | [`aistudioHideArchived.ts`](../../../../../pages/content/folder/aistudioHideArchived.ts); its switch reaches the plugin as `hideFiledChats`                                                                             |
| Drive sync, import/export, messages | [`cloud.ts`](cloud.ts), [`aistudioImport.ts`](../../../../../pages/content/folder/aistudioImport.ts)                                                                                                                    |

Sidebar width is owned separately by the official [`aistudioSidebarWidth/pluginHandler.ts`](../../../../../pages/content/aistudioSidebarWidth/pluginHandler.ts)
plugin. Turning it off restores native nav layout and leaves the folders running.
