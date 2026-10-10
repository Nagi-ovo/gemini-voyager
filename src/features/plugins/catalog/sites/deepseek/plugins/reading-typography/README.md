---
id: voyager.deepseek-reading-typography
name: DeepSeek · Reading Typography
category: readability
version: 1.0.0
author: voyager-official
license: MIT
matches:
  - https://chat.deepseek.com/*
engine: '>=1.4.0'
settings:
  fontSizeEnabled: 'boolean (default off) - apply the text size'
  fontSize: 'number (80-150, default 100) - answer text size in percent'
  spacingEnabled: 'boolean (default off) - apply line height and paragraph spacing'
  lineHeight: 'number (120-220, default 160) - line height in percent of the text size'
  paragraphSpacing: 'number (0-24, default 16) - space between paragraphs in pixels'
---

# DeepSeek - Reading Typography

Adjusts the text size, line height and paragraph spacing of DeepSeek answers.
The controls match Voyager's Gemini font size and spacing settings: text size in
percent (80-150), and one spacing switch for line height (120-220 percent) and
paragraph spacing (0-24 px). Both switches are off by default, and a switch that
is off leaves its properties native.

Only answer paragraphs and list items change. Nested items inherit the size, so
a percentage never compounds. Inline code and inline math scale with the text
around them. Code blocks keep their fixed size, and a paragraph that holds a
block formula stays native because KaTeX sizes it relative to its parent.
Headings, tables, thinking content, user messages and the composer are left
alone. DeepSeek's native text is 16 px on a 28 px line; with only the size
switch on, the line keeps that 1.75 ratio as the text grows.

Uses the DeepSeek adapter's `assistantTurn` semantic key. No extra host
permissions, native handler, remote resources or new storage keys. Disabling the
plugin removes the scoped class, both switch attributes and the stylesheet.

Related issue: #1016.
