---
name: verify-in-browser
description: Verify Voyager content-script or injected-CSS behavior in a live browser, including stale-build diagnosis.
metadata:
  version: '1.0.0'
---

# Verify a content-script change in a live browser

Unit fixtures cannot prove the current host DOM matches our assumptions. If the first fix fails, inspect the real DOM and loaded build before editing again.

## Load the intended build

1. Identify the affected browser, installed Voyager extension, its loaded directory, and the target tab (including the user's reported tab when diagnosing stale behavior).
2. Build or refresh the artifact that browser actually loads: Chrome development uses `bun run dev:chrome` / `dist_chrome_dev`; production verification uses `bun run build:chrome` / `dist_chrome`. Use `AGENTS.md` for cross-browser build requirements. Reuse an existing build if its relevant inputs are unchanged.
3. Reload the extension using an available extension-management tool or the browser UI. With Chrome DevTools, `list_extensions` identifies Voyager and `reload_extension` reloads it. Use another available tool/UI route if these are absent; request manual reload only when no available capability can do it. Safari uses `update-safari-extension`.
4. Refresh the target content-script tab so it runs the updated code. Check for unsent input or an active response before refreshing; preserve that state or use a disposable test tab until the target can be refreshed safely. Reload additional tabs only when the requested workflow needs them.
5. Confirm a build-specific marker or changed behavior in that tab before collecting evidence. An extension reload alone does not replace content scripts already running in open tabs.

If the user was seeing an old build, verify their reported tab too when safe; a new test tab alone does not resolve that report. Distinguish refreshing a test session from implementing normal conversation navigation, which must preserve the native navigation rules in `AGENTS.md`.

## Read and measure the page

Use the available DOM/browser tools. Compare actual selectors, text, computed styles and lifecycle behavior against the assumption under test; record the first mismatch and enough surrounding DOM to explain it. Keep conversation content private in shared evidence.

A temporary element can test a new CSS rule when that rule distinguishes the build; remove the probe afterward. Use an actual new marker from this change, rather than copying an unrelated class from an old fix.

## Gemini shapes that make static reasoning wrong

Each of these cost a wrong fix before it was measured.

- A user turn's `textContent` is **not** the message. The bubble also carries a
  screen-reader "You said" prefix and the copy/edit/expand controls, which render
  through a Material Symbols icon font whose glyph _is_ the element's text — so
  the string gains literal words like `content_copy`. Read `.query-text-line`.
- A long turn is **collapsed, not truncated**: all 62 lines sit in the DOM
  behind a CSS height clamp and an expand chevron. Do not design around
  recovering text that is already there.
- Text typed after a slash token lands on the prompt's **own last line**, with no
  newline between them. Anything that assumes a line boundary between the
  template and the person's words never fires.

## Before you finish

- State what you verified in the browser and what you only inferred. If the
  extension could not be reloaded, the check did not happen — say so.
- Close any tab this session created.
