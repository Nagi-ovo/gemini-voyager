# Regression Notes

Internal notes for bugs that were easy to misdiagnose or likely to regress.
This is not a second issue tracker. Keep each entry short and point to the
test that protects the behavior.

Add an entry when all of these are true:

- The root cause was non-obvious.
- A future maintainer could plausibly repeat the mistake.
- There is now a regression test or a clear verification command.

Entry format:

```md
## Short title

Symptom:

Root cause:

Fix:

Regression test:

Commit:
```

## Folder conversation navigation must not hard-refresh Gemini

Symptom:
Clicking a folder conversation sometimes forced a full Gemini page refresh
instead of switching sessions inside the existing SPA.

Root cause:
The folder navigator tried to preserve Gemini's native SPA behavior by clicking
the corresponding native sidebar link, but its fallback used `location.assign`.
That fallback fired when the native sidebar row was virtualized/not rendered,
or when Gemini's own route change was slower than the confirmation timeout.
The floating folder panel had an even more direct `location.assign` path.

Fix:
Route folder and floating-panel conversation clicks through the shared
conversation navigator. If the native link is missing or does not navigate,
fall back to `history.pushState` plus `popstate`, not a hard page load.

Regression test:
`src/pages/content/folder/__tests__/folderNavigation.test.ts`
`src/pages/content/folder/__tests__/folderDisabledRuntime.test.ts`

Commit:
`fix(folder): keep folder navigation in gemini spa`

## Prevent auto scroll swallowed `scrollIntoView` layout side effects

Symptom:
With prevent-auto-scroll enabled, sending a Gemini message could make the
sidebar/folder area render far too wide. Collapsing and reopening the sidebar
restored the layout.

Root cause:
The page script returned early from Gemini's native `scrollIntoView`. That
blocked the downward chat jump, but it also swallowed Gemini's own layout side
effects for the sidebar.

Fix:
Let the native `scrollIntoView` run, then restore protected vertical scroll
positions for the chat/viewport.

Regression test:
`src/pages/content/preventAutoScroll/__tests__/preventAutoScrollScript.test.ts`

Commit:
`b9dfaf1e fix(prevent-auto-scroll): preserve layout side effects`

## Sidebar scroll exception must stay scoped away from chat scroll blocking

Symptom:
The prevent-auto-scroll feature blocked the Gemini sidebar history list from
scrolling after a submit.

Root cause:
The original blocking logic applied to any scrollable ancestor while the
submit block window was active. Sidebar scroll containers were treated like the
chat transcript.

Fix:
Classify sidebar elements separately from chat scroll elements before blocking
`scrollTo`, `scrollBy`, `scrollTop`, or `scrollIntoView`.

Regression test:
`src/pages/content/preventAutoScroll/__tests__/preventAutoScrollScript.test.ts`

Commit:
`69834523 fix(prevent-auto-scroll): keep sidebar history scrollable`

## Gemini table menus are not model menus

Symptom:
Gemini table option menus showed Voyager default-model star buttons, including
the "Set as default model" tooltip.

Root cause:
The default model injector treated generic Gemini menu DOM such as
`.label-container` as enough evidence that a popup was a model menu. Gemini
table menus use similar menu structure.

Fix:
Require model-menu evidence such as `data-mode-id`, `.mode-title`, or
`.title-and-description` before injecting star buttons.

Regression test:
`src/pages/content/defaultModel/__tests__/modelLocker.test.ts`

Commit:
`2d7d8e12 fix(default-model): avoid table option menu stars`

## Default model auto-apply must yield to active composer input

Symptom:
Typing in a fresh Gemini chat could lose focus while the page was still
loading. Disabling default-model auto-apply made the problem disappear.

Root cause:
The default-model lock loop opened Gemini's model picker after startup even
when the user had already started typing in the composer. The follow-up
refocus helped after the switch, but the menu click still stole focus first.

Fix:
Track composer input/keydown activity and skip the current auto-apply attempt
once the user has started editing the chat input.

Regression test:
`src/pages/content/defaultModel/__tests__/modelLocker.test.ts`

Commit:
`fix(default-model): avoid stealing composer focus`

## Thinking-level default must resolve by label, not per-row OR

Symptom:
Both Standard and Extended showed a filled default star at once in the
Thinking level submenu — two "defaults" selected simultaneously.

Root cause:
`isThinkingDefaultForItem` marked a row default when EITHER its label matched
the stored label OR its position matched the stored index. When the stored
`{index, label}` pair drifted apart (e.g. saved under a different submenu
order/language), the label lit one row and the stale index lit another, so two
stars turned gold. The stored index and label are separate keys and can
disagree; an OR test over each row cannot stay single-valued.

Fix:
Resolve exactly one default row per render (`resolveThinkingDefaultIndex`):
prefer the label match, fall back to the stored index only when no label
matches and it addresses a real row. The star click now reads its own
`is-default` class instead of re-deriving from `(index, label)`.

Regression test:
`src/pages/content/defaultModel/__tests__/modelLocker.test.ts`
("marks only one thinking level default when the stored index and label
disagree")

Commit:
`fix(default-model): resolve single thinking-level default`

## Auto-applied thinking level must close the picker it opened

Symptom:
After auto-selection ran, the Thinking level row was unresponsive — clicking it
did nothing until the whole model picker was closed and reopened by hand.

Root cause:
`tryLockToThinkingLevel` opened the picker and thinking-level submenu
programmatically, clicked the target level, then refocused the composer but
never closed the menu. The half-open picker (with a lingering submenu overlay)
left the row's hover/submenu machinery in a state the user's next open could
not drive.

Fix:
Close the menu (`document.body.click()`) right after the auto-switch click, so
the next manual open starts clean — mirroring the already-selected branch.

Regression test:
`src/pages/content/defaultModel/__tests__/modelLocker.test.ts`

Commit:
`fix(default-model): close picker after auto thinking switch`

## Never lock to the page-default Standard thinking level

Symptom:
On an already-correct new chat (model + thinking already at the starred value)
the model picker still flashed open for a moment on load, intermittently.

Root cause:
The lock loop always started (first tick at 1s) and, in load-timing windows,
opened the picker to "enforce" a thinking-level default even when Standard —
Gemini's built-in default — was the target. Enforcing Standard is a pure no-op
(the page already opens there) so the open was always wasted churn. A default
corrupted to a non-Standard value by the double-star bug made it worse.

Fix:
Treat a Standard target (index 0 / label "standard") as "no thinking
preference" for enforcement (`isPageDefaultThinkingLevel`), keeping the raw
value only for the star display. Also bail before starting the loop when the
trigger pill already shows the starred model + thinking level.

Regression test:
`src/pages/content/defaultModel/__tests__/modelLocker.test.ts`
("never enforces the page-default Standard thinking level")

Commit:
`fix(default-model): don't enforce Standard thinking level`

## tryLockToModel must reuse the bidirectional pill match

Symptom:
On load the model picker still flashed open for an instant and left a focus
ring on the trigger pill, even though the model + thinking level were already
the starred values (Pro + Standard).

Root cause:
`tryLockToModel`'s "already selected" early-return used a forward-only
whole-word test: it checked whether the stored long name ("3.1 pro") appeared
in the short pill label ("pro"), which is false. So whenever a tick reached
it — e.g. a load-timing window where the pill briefly read empty and
`modelMatchesLines` returned false — it opened the picker to "switch" to a
model that was already selected, then closed it. Angular CDK restored focus to
the trigger on close, leaving the ring.

Fix:
Early-return using the same `modelMatchesLines` (bidirectional short/long)
check as the fast-path, and bail without opening the menu when the pill is not
readable yet (retry next tick).

Regression test:
`src/pages/content/defaultModel/__tests__/modelLocker.test.ts`
("does not open the picker while the trigger pill is still empty")

Commit:
`fix(default-model): reuse bidirectional match in tryLockToModel`

## Gemini native copy traffic is not generation traffic

Symptom:
Clicking Gemini's native copy response button could make the page feel stuck
or trigger generation-related observers.

Root cause:
The observers looked at `batchexecute` request bodies and could match
generation-looking text inside copy-related traffic. Both `fetch` and XHR paths
needed the same guard.

Fix:
Ignore copy/non-generation `batchexecute` requests before treating traffic as
generation completion or usage refresh evidence.

Regression test:
`src/pages/content/responseNotification/__tests__/pageObserver.test.ts`
`src/pages/content/usageStatus/__tests__/usageObserver.test.ts`

Commit:
`7c0916fd fix(notification): ignore copy batchexecute keyword matches`

## Gemini usage buckets must use the period enum, not reset order

Symptom:
The Gemini usage bar could swap the 5h and weekly limits.

Root cause:
The parser inferred bucket labels from reset order. That breaks when the
weekly reset is sooner than the rolling 5h window.

Fix:
Use Gemini's period enum when present. Do not guess labels from reset order
when the enum is unknown.

Regression test:
`src/pages/content/usageStatus/__tests__/usageStatus.test.ts`

Commit:
`146a698f fix(usage): map Gemini usage buckets by period`

## KaTeX radicals need their SVG layout preserved before export

Symptom:
PDF/image exports rendered square-root radicals and fractions misaligned,
especially for Gemini math such as `\sqrt{2} \approx 1.414`.

Root cause:
Export rendering changed display/layout primitives around Gemini's KaTeX/SVG
radical nodes. The live DOM looked acceptable, but the export clone lost
enough layout information for radicals to shift.

Fix:
Preserve KaTeX layout primitives and inline radical SVG layout before PDF/image
rendering.

Regression test:
`src/features/export/services/__tests__/DOMContentExtractor.test.ts`
`src/features/export/services/__tests__/ImageRenderService.test.ts`
`src/features/export/services/__tests__/PDFPrintService.test.ts`
`bun run verify:katex-export`

Commit:
`fa059943 fix(export): preserve Gemini KaTeX radicals`

## KaTeX image export does not follow the PDF path

Symptom:
PDF export rendered square-root formulas correctly, but image export still
misplaced radicals/fraction layout. It was easy to think the fix worked by only
checking the PDF output.

Root cause:
PDF and image exports use different render paths. The image path goes through
`html-to-image`, which clones the target node and may scan the whole page's
stylesheets. On Gemini, cross-origin stylesheets can trip `cssRules` access and
KaTeX radicals/fractions depend on fragile `.vlist`, `.pstrut`, `.sqrt`, and
stretchy SVG/image layout rules, not just the KaTeX font files.

Fix:
Use Fable 5's verified image-path fix: supply scoped KaTeX font CSS via
`fontEmbedCSS` and inline the critical KaTeX layout primitives before capture.
The verification harness must exercise `ImageRenderService.renderTargetToBlob`,
not a direct `html-to-image` call or the PDF print flow.

Regression test:
`src/features/export/services/__tests__/ImageRenderService.test.ts`
`bun run verify:katex-export`

Commit:
`5a28ef00 fix(export): preserve katex layout in image exports`

## Claude usage settings hash may not open the modal by itself

Symptom:
Clicking the Claude usage link changed the URL hash to `#settings/usage`, but
the usage modal did not open until the page was refreshed.

Root cause:
Claude's SPA sometimes observes the usage hash only during load. A hash-only
navigation on an existing chat path is not always enough to mount the settings
modal.

Fix:
Keep the current chat path in the usage URL and reload only when usage content
does not appear after opening.

Regression test:
`src/features/plugins/builtin/claudeUsage/index.test.ts`

Commit:
`50f947fc fix(plugins): match claude usage reset display to gemini`

## Claude usage reset data can come from multiple surfaces

Symptom:
The Claude usage bar showed percentages but missed the reset countdown,
especially for the 5h window.

Root cause:
The visible settings DOM and the usage API do not always expose the same reset
data. Some 5h reset information arrives through `message_limit` events.

Fix:
Normalize usage API windows, visible settings DOM, cached snapshots, and
`message_limit` events into the same metric shape.

Regression test:
`src/features/plugins/builtin/claudeUsage/index.test.ts`
`src/features/plugins/builtin/claudeUsage/observer.test.ts`

Commit:
`8adae20a fix(plugins): fill claude 5h reset countdown`

## Chrome-only permissions must not leak into the shared base manifest

Symptom:
The Prompt Manager discovery nudge dots the toolbar icon via
`chrome.declarativeContent`, which exists only on Chrome/Edge. Declaring
`declarativeContent` in `manifest.json` would ship it to Firefox and Safari
too, where it is an unknown permission (AMO lint failure / Safari conversion
noise) even though the runtime code already no-ops there.

Root cause:
`manifest.json` is the single base manifest spread into every browser build
(`vite.config.base.ts` → `baseManifest`, consumed by the chrome/firefox/safari
configs). A permission added there is cross-browser by default. It is tempting
to drop a new permission into `manifest.json` next to the others.

Fix:
Inject Chrome/Edge-only permissions in `vite.config.chrome.ts`, where it spreads
`baseManifest` (`permissions: [...base, 'declarativeContent']`), keeping the base
manifest cross-browser clean. Guard the runtime with
`if (!chrome.declarativeContent?.onPageChanged) return;`. Two related traps for
the same feature: declarativeContent has no badge action, so `SetIcon` needs
`imageData` (an `ImageData`, not a `path`) — draw the dot with OffscreenCanvas;
and the dot lives on the toolbar icon, so unpinned users only see it inside the
puzzle menu (Chrome has no pin API; an in-page banner was rejected to preserve
"No access needed").

Regression test:
`src/features/plugins/__tests__/promptNudge.test.ts` (pure domain math).
Manifest scoping is verify-by-build:
`bun run build:chrome && grep -c '"declarativeContent"' dist_chrome/manifest.json`
must be `1`, while `manifest.json` / `manifest.dev.json` must be `0`.

Commit:
`f0f4bebe feat(prompt-nudge): dot the toolbar icon on unenabled chatgpt/claude sites`

## Claude timeline must treat the DOM as a sliding virtualized window

Symptom:
On claude.ai, the timeline "twitched" while scrolling long conversations —
dot count and positions changed constantly; after a long jump the timeline
suddenly shrank to a few dots; clicking a dot for an off-screen turn landed
mid-conversation instead of on the target message.

Root cause:
Claude virtualizes long conversations: only ~6–9 turns are mounted, the
window slides during scroll, and during long jumps the mounted set can be
sparse and NON-contiguous (old + new window briefly coexist; the tail tends
to stay mounted). Rebuilding markers from `querySelectorAll` each mutation
made the timeline mirror the mounted window; mount-index-based turn ids
(`c-<index>-<hash>`) changed as the window slid; any "drop what's missing
between two mounted turns" pruning rule mass-deletes markers when the window
goes sparse. Absolute offsets also drift because Claude re-measures content
as it mounts, so one-shot smooth scrolls to remembered offsets land off
target.

Fix:
`claudeTimeline` keeps a grow-only marker registry stitched by content-hash
anchors across overlapping windows (never drops; ids `c-<textHash>`, `~n`
for duplicates; legacy starred ids match via their hash segment). Navigation
to unmounted turns homes in iteratively (instant probe + direction-aware
bisection, smooth fine-aim once mounted); jumps >3 viewports are instant
even for mounted turns. Reuse this pattern for any future Claude DOM
feature.

Regression test:
`bun run test src/features/plugins/builtin/claudeTimeline/index.test.ts`
(esp. "never shrinks when the mounted window turns sparse mid-transition",
"keeps dots and ids stable when Claude virtualizes turns out during scroll").

Commit:
`05e0ef79 fix(claude-timeline): stop timeline jitter from claude's virtualized dom`
