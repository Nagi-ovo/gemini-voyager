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
