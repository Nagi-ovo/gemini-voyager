---
id: voyager.chatgpt-reading-typography
name: ChatGPT · Reading Typography
category: readability
version: 1.0.0
author: voyager-official
license: MIT
matches:
  - https://chatgpt.com/*
  - https://chat.openai.com/*
engine: '>=1.4.0'
settings:
  fontSizeEnabled: 'boolean (default off) - apply the text size'
  fontSize: 'number (80-150, default 100) - answer text size in percent'
  spacingEnabled: 'boolean (default off) - apply line height and paragraph spacing'
  lineHeight: 'number (120-220, default 160) - line height in percent of the text size'
  paragraphSpacing: 'number (0-24, default 16) - space between paragraphs in pixels'
---

# ChatGPT - Reading Typography

Adjusts the text size, line height and paragraph spacing of ChatGPT answers.
The controls match Voyager's Gemini font size and spacing settings: text size in
percent (80-150), and one spacing switch for line height (120-220 percent) and
paragraph spacing (0-24 px). Both switches are off by default, and a switch that
is off leaves its properties native.

Only answer paragraphs, list items and table cells inside the reply's
`.markdown` change, as Gemini's text size does. Nested items and cells inherit
the size, so a percentage never compounds. Inline code and inline math scale
with the text around them. Code blocks (`[data-markdown-copy="code-block"]`,
or `pre` in the earlier DOM) are skipped, and a paragraph that holds a block
formula stays native because KaTeX sizes it relative to its parent. User
messages and the composer are left alone. With only the size switch on, the
line height keeps a fixed ratio to the text (`--gv-plugin-reading-line-ratio`
in `style.css`), so a fixed native line box grows with the text.

Uses the ChatGPT adapter's `assistantTurn` semantic key. No extra host
permissions, native handler, remote resources or new storage keys. Disabling the
plugin removes the scoped class, both switch attributes and the stylesheet.

## Verification

- Page: pending a live check on a real ChatGPT conversation.
- Native values (2026-10-11): answer text 16 px on a 26 px line (rem tokens,
  ratio 1.625), table cells 14 px / 20 px, inline code 0.93em, code blocks
  12 px. The live answer root is `[data-markdown-text-style]`; `.markdown` is
  kept for the earlier DOM.
- Light theme: pending.
- Dark theme: pending.
- `bun run plugin:check src/features/plugins/catalog/sites/chatgpt/plugins/reading-typography`: passes.
- Popup: pending (each slider greyed out until its switch is on).

Port of `voyager.deepseek-reading-typography` (#1016).
