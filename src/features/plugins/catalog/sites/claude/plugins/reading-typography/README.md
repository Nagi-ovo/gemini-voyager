---
id: voyager.claude-reading-typography
name: Claude · Reading Typography
category: readability
version: 1.0.0
author: voyager-official
license: MIT
matches:
  - https://claude.ai/*
engine: '>=1.4.0'
settings:
  fontSizeEnabled: 'boolean (default off) - apply the text size'
  fontSize: 'number (80-150, default 100) - answer text size in percent'
  spacingEnabled: 'boolean (default off) - apply line height and paragraph spacing'
  lineHeight: 'number (120-220, default 160) - line height in percent of the text size'
  paragraphSpacing: 'number (0-24, default 16) - space between paragraphs in pixels'
---

# Claude - Reading Typography

Adjusts the text size, line height and paragraph spacing of Claude answers.
The controls match Voyager's Gemini font size and spacing settings: text size in
percent (80-150), and one spacing switch for line height (120-220 percent) and
paragraph spacing (0-24 px). Both switches are off by default, and a switch that
is off leaves its properties native.

Only answer paragraphs, list items and table cells inside the reply's
`.standard-markdown` change, as Gemini's text size does. Nested items and cells
inherit the size, so a percentage never compounds. Inline code and inline math
scale with the text around them. Code blocks (`pre`) are skipped, and a
paragraph that holds a block formula stays native because KaTeX sizes it
relative to its parent. User messages and the composer are left alone. With
only the size switch on, the line height keeps a fixed ratio to the text
(`--gv-plugin-reading-line-ratio` in `style.css`), so a fixed native line box
grows with the text. Artifacts, which render in their own frame, are not
changed.

Uses the Claude adapter's `assistantTurn` semantic key. No extra host
permissions, native handler, remote resources or new storage keys. Disabling the
plugin removes the scoped class, both switch attributes and the stylesheet.

## Verification

- Page: pending a live check on a real Claude conversation.
- Native values (2026-10-11): answer text 15 px on a 22 px line (rem tokens,
  ratio 22/15), inline code 0.9em. Table cells and code blocks: no sample yet.
- Light theme: pending.
- Dark theme: pending.
- `bun run plugin:check src/features/plugins/catalog/sites/claude/plugins/reading-typography`: passes.
- Popup: pending (each slider greyed out until its switch is on).

Port of `voyager.deepseek-reading-typography` (#1016).
