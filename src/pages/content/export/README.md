# Export ownership

Start with the owner of the behavior being changed. `index.ts` is the composition root: it
resolves the export site once per page, creates the runner, and mounts the entry points
(persistent toolbar, conversation/response menus, logo dropdown, copy-as-image). File writing
(JSON/Markdown/PDF/image) lives in `src/features/export/`; it renders only content that was read
from the page beforehand (`extractTurnContent` with an extractor from `createContentExtractor`).

| Change                                                                               | Owner                                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Platform selectors, titles and content dialect; ChatGPT crawl, session, thread watch | `adapter/`                                                                           |
| Per-host export: label, entry points, turn source, lazy history; site registration   | `exportSite.ts`, `sites/` (+ `adapter/platformAdapters.ts`)                          |
| Read turns and selectable messages from the page, Canvas snapshots, message ids      | `conversationCollector.ts` (+ `conversationDom.ts`, shared with fork)                |
| One export run: preload, resume, preparation/release, final export, operation abort  | `exportRun.ts` (+ `preparedExport.ts`, `pendingExportState.ts`, `topNodePreload.ts`) |
| Selection mode: checkboxes, bar, role filters, lazy-load refresh, Cancel/Escape      | `exportSelectionSession.ts`                                                          |
| ChatGPT crawl progress (turns read) and its Cancel                                   | `chatgptCrawlProgress.ts`                                                            |
| Export turn anchor health after collection                                           | `exportRun.ts`, `exportHealth.ts`                                                    |
| Shared cancellation checks                                                           | `exportCancellation.ts`                                                              |
| Centring the selection bar over the conversation                                     | `exportOverlayUi.ts`                                                                 |
| Generated-UI iframe screenshots and their permission prompt                          | `generatedUiScreenshots.ts`                                                          |
| Export item in Gemini conversation / sidebar / response menus                        | `conversationMenuExportObserver.ts` (+ `conversationMenuInjection.ts`)               |
| Opening a sidebar conversation before exporting it                                   | `sidebarConversationNavigation.ts`                                                   |
| Copy a single response as an image (button, width menu, Safari fallbacks)            | `responseCopyImageAction.ts`                                                         |
| Logo dropdown button (old Gemini layout) and its re-creation after re-renders        | `logoExportButton.ts`                                                                |
| Always-visible toolbar (lr26 Gemini, ChatGPT and other plugin hosts)                 | `persistentExportToolbar.ts`, `exportEntryGate.ts`                                   |
| Dictionaries, language reads and the `t()` used by every export surface              | `exportLocale.ts`                                                                    |
| Progress, outcome and problem toasts of every export surface                         | `src/features/export/ui/exportToasts.ts`                                             |

Each owner takes its dependencies explicitly (site, translator, callbacks) and keeps
its listeners, observers and timers beside the code that installs them. Page-wide observers
(menu watcher, copy-image buttons) are singletons that stop on `beforeunload`. The runner is the only
owner of the active export operation: a new run aborts the previous one and dismisses its
selection UI.

Keep these less obvious boundaries intact:

- Gemini's preload click can reload the page. `exportRun.ts` persists the run in sessionStorage
  before clicking; `startExportButton` resumes it on load. Do not move that persist after the click.
- `generatedUiScreenshots.ensureGeneratedUiScreenshotPermission()` must run while the user gesture
  is still valid: before the run in the dialog, and before `takeSelection()` in selection mode.
- `exportRun.ts` awaits `preparedExport.runPreparedExport()` through the entire selection session.
  A turn source's `prepare()` returns a session that owns what it read (ChatGPT: the crawl, the
  thread watch and the checkbox hosts) and stands in for the source until it is released after
  selection ends, including cancellation, teardown and failures. Starting a preparation releases
  the previous one, so an older run can never publish over a newer run.
- Final builders read Saved Library stars once per build; selection needs no star input.
  Gemini keeps its verified stored turn aliases. ChatGPT captures the timeline's normalized
  user-bubble hash during the existing crawl or selected-prompt extraction; assistant-only
  retained selections resolve only their paired prompt. Read failures reject; no page star
  cache or mirror participates.
- Fork and export share Gemini pairing (`conversationDom.ts`) but not ids: fork keeps `makeTurnId`
  (`fork/turnId.ts`); export keeps `resolveUniqueExportTurnIds` (`selectionIds.ts`).
- Selection UI is removed (`takeSelection()`) before screenshots so it is not captured.
- Opening a sidebar conversation uses the native link click; the `location.assign` fallback is the
  only full navigation and is pre-existing.

Owner tests exercise DOM behavior through each module's interface: `exportRun.test.ts` covers a run
end to end with a fake site, `exportSelectionSession.test.ts` the selection UI.
