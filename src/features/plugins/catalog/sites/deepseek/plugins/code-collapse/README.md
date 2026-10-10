---
id: voyager.deepseek-code-collapse
name: DeepSeek · Code Folding
category: readability
version: 1.0.0
author: voyager-official
license: GPL-3.0-or-later
matches:
  - https://chat.deepseek.com/*
engine: '>=1.8.0'
---

# DeepSeek · Code Folding

A long code block in a DeepSeek answer can run for hundreds of lines, so the
prose after it is a long scroll away (issue #1015). With the plugin on, a block
of 24 or more lines, or 520px of code, starts collapsed to a short preview that
fades out. A toggle next to DeepSeek's copy button expands or collapses it, and
once a page has two such blocks a small bar before the first one expands or
collapses them all.

The code itself is never cut: collapsing clips the `pre` with CSS, and
DeepSeek's copy, download and run buttons still act on the whole block.
Code inside the thinking section is left alone.

## How it works

The plugin has no code of its own. It invokes Voyager's `codeCollapse`
primitive, which runs the engine behind Gemini's native code block collapse
(`pages/content/codeBlockCollapse/engine.ts`) with the same thresholds, toggle
and labels. Blocks come from the DeepSeek adapter's `codeBlock`
(`.md-code-block`) inside `assistantTurn`, outside `thinkingBlock`; the
manifest's `action` param puts the toggle in the row of the banner's
`[role="button"]` controls.

- A block that grows past the threshold while the answer streams collapses then.
  Expanding or collapsing it is remembered for that block while it streams, and
  when DeepSeek swaps the `pre` inside it.
- After expand all or collapse all, blocks that appear later follow that choice.
- Only the blocks that changed are measured again; there is no full-page rescan.
- Turning the plugin off removes the toggles, the bar, the classes and the
  stylesheet, so every block is back as DeepSeek rendered it.

Requires Voyager plugin engine 1.8.0 or newer (`requires.handlers: ["codeCollapse"]`).
Ships disabled; enable it from the popup on DeepSeek.

## Verification

- DOM: `.md-code-block > pre` inside `.ds-assistant-message-main-content`, the
  copy row in `.md-code-block-banner`, measured on a real conversation
  (10 blocks, 6 of them in the thinking section).
- The primitive's classes and stylesheet applied by hand to that page (dark
  theme): long blocks clip to the preview, the toggle sits in the copy /
  download / run row, and the bar sits above the first block. The styles use
  only `currentcolor` and a neutral translucent hover, so they follow either theme.
- With the extension loaded on a live page (streaming, toggling, light theme): pending.
- `bun run plugin:check src/features/plugins/catalog/sites/deepseek/plugins/code-collapse`: passes.
