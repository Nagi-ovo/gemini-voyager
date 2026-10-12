---
name: write-voyager-plugin
description: "Write and check a local plugin for the Voyager browser extension (Gemini, AI Studio, ChatGPT, Claude, DeepSeek). A plugin is a JSON manifest plus CSS that restyles or rearranges the chat page. Use when the user wants to change how one of these sites looks or is laid out through Voyager."
---

# Write a Voyager plugin

Voyager is a browser extension for AI chat sites. A local plugin is a declarative JSON manifest (plugin.json) plus CSS that restyles or rearranges a chat page through reversible page changes. It runs no code of its own: Voyager checks it strictly on import, applies it, and removes every change when the plugin is turned off.

This skill is generated from Voyager’s plugin engine 1.9.0. The latest copy is at https://voyager.nagi.fun/skills/write-voyager-plugin/SKILL.md.

## Workflow

1. Find out which site the change is for and what should change. Then scaffold a folder:
   `npx create-voyager-plugin@latest init my-plugin --site <site>` (site: gemini, aistudio, chatgpt, claude, deepseek) writes plugin.json, style.css and an AGENTS.md with this contract for that site. Without Node, write the two files by hand from the examples below.
2. Edit plugin.json and style.css for the request. Give the plugin its own "id", "name" and class names.
3. Run `npx create-voyager-plugin@latest check my-plugin`. It runs the same checks as Voyager’s popup import, offline, and exits 0 only when the plugin would import. Fix every `path: message` line it prints and run it again. `--json` prints the issues as a JSON array of { path, message }, empty when it imports.
4. Hand over to the user: open the target site, open the Voyager popup, find the "Local plugins" card (the last entry on Gemini and AI Studio), choose Import files and pick plugin.json together with style.css. The plugin lands switched off; the user turns it on in the plugin list. Re-importing the same "id" replaces the installed version (raise "version" when you change it).
5. Ask the user to look at the page in both light and dark theme. If a selector matches nothing, see "Finding selectors".

## Manifest contract

- Required non-empty string fields: id, name, version, description, author, category, license, engine. Also "tier": "declarative", "matches" (see the target site) and "contributes".
- "id": a short lowercase reverse-dotted slug such as "me.short-name" (a-z, 0-9, ".", "_", "-"). Voyager stores it as "local.<id>"; you do not add that prefix.
- "version": "1.0.0"; raise it when you change the plugin. "author": "me". "license": "MIT".
- "engine": ">=1.0.0", or ">=" the sinceEngine of every primitive the plugin uses. This build's plugin engine is 1.9.0.
- "category": one of render-fix, theme, layout, readability, productivity, integration, other.
- Write "name" and "description" in the language of the user. "i18n" translations are optional for a local plugin.
- Optional: "$schema": "https://voyager.nagi.fun/plugin.schema.json" lets an editor check the file as you type. The import gate is stricter than the schema; `check` is the authority.

## Styles

- "contributes.styles": [{ "file": "style.css" }] with the CSS in style.css beside plugin.json. The popup’s Import files reads plugin.json plus the .css files picked with it; Paste JSON only takes inlined CSS ([{ "css": "..." }]).
- Import files takes exactly one .json file: the user picks plugin.json and its .css files, nothing else.
- CSS may not load anything, not even from the same site: no @import, image-set(), image(), cross-fade() or src(), and url() only with a #fragment or a png, jpeg, gif, webp or avif data: URI (never SVG). No web fonts, no remote images.
- Scope every rule under a class your plugin adds (see addClass), so nothing else changes. Site styles often win on specificity: add !important where a rule does not apply.
- Light or dark only rules: scope them with html[data-gv-scheme='dark'] or html[data-gv-scheme='light'], never with the site's own theme classes.

## Page changes

- "contributes.domOps": reversible page changes. Allowed "op" values: addClass, setAttribute, setStyle, hide, and "native" where the site allows primitives. Voyager applies them to every match, again as the page changes, and removes them when the plugin is turned off. One example of each:
  - addClass: { "op": "addClass", "target": { "kind": "semantic", "key": "userTurn" }, "className": "gv-plugin-my-change" }
  - setAttribute: { "op": "setAttribute", "target": { "kind": "semantic", "key": "userTurn" }, "name": "data-gv-plugin", "value": "my-change" }
  - setStyle: { "op": "setStyle", "target": { "kind": "semantic", "key": "userTurn" }, "styles": { "max-width": "960px" } }
  - hide: { "op": "hide", "target": { "kind": "semantic", "key": "userTurn" } }
- "target": prefer { "kind": "semantic", "key": <anchor> } with an anchor the target site declares. Use a plain CSS selector string only for something no anchor names; it breaks on a redesign.
- addClass "className": exactly one class that starts with "gv-"; use "gv-plugin-<plugin-name>". Then style that class in "contributes.styles".
- setAttribute "name" must be one of: title, role, lang, dir, hidden, tabindex, draggable, spellcheck, translate, style, data-*, aria-*. Never href, src, on*, class or id. Values may not contain an external URL.
- setStyle "styles": CSS property -> value, custom properties (--gv-…) included; values may not load anything either.

## Settings (optional)

- "contributes.settings": { "<key>": { "type", "label", "default", … } }. Types: boolean, number, select. string and color settings are refused: the popup has no control for them yet.
- number: the popup shows a slider from "min" to "max" (0 and 100 when omitted), with optional "minLabel" and "maxLabel" at its ends.
- select: "options": [{ "value": "…", "label": "…" }] with at least one option and unique values, and a "default" that is one of the values.
- Optional "enabledBy": "<booleanKey>" keeps a number, select or boolean control visible but disabled unless that boolean setting resolves to true; its value is retained. The key must be non-empty and name another boolean in the same plugin. Its target must have no enabledBy of its own (one level only). This changes only the popup control; gate page behavior separately with the boolean. Engine 1.7.0 ignores enabledBy and leaves the control enabled, so no higher engine floor is needed.
- Use a setting through a {{key}} token in CSS text, a setStyle value or a setAttribute value; Voyager substitutes the current value (the default until the user changes it). A common pattern: setStyle sets a custom property from the setting, and the CSS reads var(...).
- A boolean renders as "true" or "false": set data-gv-… to "{{key}}" with setAttribute and style [data-gv-…='true'].

## Local plugin rules

- "matches" may only use patterns inside a site Voyager supports (listed per site).
- Every semantic key the plugin relies on must be declared by every site its "matches" cover.
- On Gemini and AI Studio: no "theme", and a "native" op only for the primitives listed for that site (Voyager runs its other features there itself).
- "theme": { "brand": "#rrggbb" } optionally recolors Voyager’s own UI on Claude, ChatGPT or DeepSeek. "requires" is optional: native ops already imply "requires.handlers".
- An import lands switched off; the user reviews it and turns it on in the popup.

## Primitives

A primitive is behavior Voyager ships as code; a plugin can only call it by name and configure it: { "op": "native", "handler": "<name>", "params": { … } }. A param marked required must be set; every other param is optional. A semanticKey param names a semantic key (only the listed ones when it says "one of"); every matched site must declare it, as with the keys a primitive reads, so it need not be repeated in "requires.semantic". Set "engine" to ">=" the primitive’s sinceEngine (and any param’s). On Gemini and AI Studio only the primitives listed for that site, and only on a site that declares the semantic keys the primitive reads.
- To pass a setting into params, use "{{key}}" in a string value, recursively inside objects and arrays. Parameter names and object keys stay literal. A whole-value token preserves the setting's number, boolean or string type; embedded "a{{key}}b" produces a string. Expansion runs once: tokens inside setting values remain literal. Set "engine" to ">=1.8.0" or any higher primitive/param floor; this capability's floor stays 1.8.0 in later releases.
- Every referenced key must exist in contributes.settings and its type must fit the primitive contract wherever statically knowable. Manifest loading checks substituted defaults. Each activation substitutes resolved stored values and runs the primitive’s validateParams; an invalid result skips the op with the same diagnostic as invalid static params. Setting changes dispose then reactivate templated primitive ops in order; static params keep the existing in-place update path.
- Example: turnNavigator params { "position": "{{side}}" } with a select setting side whose options are left and right.

- codeCollapse (sinceEngine 1.8.0): Collapses long code blocks in replies with Gemini's code block collapse: a toggle per block plus expand all / collapse all, with the code and the host's copy controls left intact. Long blocks start collapsed, the user's choice holds while a reply streams, and turning the plugin off restores every block. A block another code collapse already holds is left to it. On Gemini it is Gemini's own collapse and ignores params: every code block on the page, long ones expanded until the user folds them, no expand all bar, diagram blocks skipped. Reads: assistantTurn, codeBlock.
  - code (selector): Element inside the code block holding the code, measured for length and clipped while collapsed; defaults to pre, else the block itself.
  - action (selector): A native control inside the code block, such as its copy button; the toggle joins that control's row. Without it the toggle goes at the end of the block.
- collapse (sinceEngine 1.8.0): Caps the visible height of long semantic content with an expand/collapse toggle outside the clipped element. Streaming content is measured incrementally, and an expanded element stays expanded while it survives host re-renders. Turning the plugin off restores its native layout.
  - target (semanticKey, required, one of userTurn, assistantTurn, thinkingBlock): Semantic content key to collapse: userTurn, assistantTurn or thinkingBlock. Do not target content the host already collapses.
  - maxPx (number): Collapsed height in pixels, from 80 to 2000; defaults to 320. Content must exceed this height by more than 16 pixels to get a toggle.
  - startCollapsed (boolean): Whether long content starts collapsed; defaults to true.
- copyButton (sinceEngine 1.8.0): A small copy button above each element the site adapter names by `target` (a thinking block, a message, a reply, a code block) copies that element's visible text, without Voyager's own controls inside it, and confirms with a toast. The element stays untouched; turning the plugin off removes the buttons.
  - target (semanticKey, required, one of userTurn, assistantTurn, thinkingBlock, codeBlock): Semantic key whose elements each get a copy button. Every matched site must declare it.
  - format (string): What the button copies: "text" (default), the element's visible plain text.
- counterBadge (sinceEngine 1.8.0): A small read-only badge with a live count of the composer draft or of each assistant reply. The badge is pointer-transparent and outside the text, so copying and export never include it; turning the plugin off removes every badge.
  - target (semanticKey, required, one of composer, assistantTurn): What is counted: "composer" (the draft, one badge above the composer) or "assistantTurn" (one badge at the end of each reply).
  - metric (string): What the badge counts: "chars" (default; Unicode code points without line breaks), "words" (whitespace-separated words, each CJK character one word), "cjkChars" (Han, kana and Hangul characters only) or "lines".
- draftSave (sinceEngine 1.8.0): Saves unsent text in the main composer to this device and puts it back when the same conversation (or the new-chat page) opens again, only into an empty composer. Drafts are keyed by the site and the conversation id from the adapter's conversationIdPattern, and a draft is dropped once its message is sent. Turning the plugin off keeps saved drafts. Reads: composer, sendButton.
- echarts (sinceEngine 1.7.0): Renders ECharts option code blocks in replies as interactive charts with a Diagram / Code toggle, using the parser, sanitizer and renderer Gemini uses. The code block stays in the page for copy and export; turning the plugin off removes the charts. Reads: assistantTurn, codeBlock.
  - turn (selector): Reply elements whose code blocks are rendered; defaults to the site adapter's assistantTurn.
  - codeBlock (selector): One code block inside a reply. The diagram goes right before it, and it is hidden while the diagram shows. Defaults to the site adapter's codeBlock, else pre.
  - code (selector): Element inside the code block holding the source text; defaults to code, else the block itself.
  - codeLine (selector): Line elements inside the source element, joined with newlines, for hosts that render one element per line without newline characters.
  - language (selector): Element inside the code block whose text is the language label; defaults to a language-* class on the source element or the block.
  - copyButton (boolean, since 1.9.0): Adds a Copy button to the diagram's toolbar that copies the block's source, for a host whose own copy button is inside the code block the diagram view hides. Default false.
  - exportImage (boolean, since 1.9.0): Lets Voyager's PNG and PDF export show the drawn diagram (Mermaid in its light theme) instead of the block's source; Markdown keeps the source, and a block still drawing or shown as code exports its source. Default false.
- formulaCopy (sinceEngine 1.3.0): Click an inline or block formula to copy its LaTeX; hover shows it is clickable. Reads KaTeX / MathJax markup on the page.
- mermaid (sinceEngine 1.7.0): Renders Mermaid code blocks in replies as diagrams with a Diagram / Code toggle, using the renderer Gemini uses. The code block stays in the page for copy and export; turning the plugin off removes the diagrams. Reads: assistantTurn, codeBlock.
  - turn (selector): Reply elements whose code blocks are rendered; defaults to the site adapter's assistantTurn.
  - codeBlock (selector): One code block inside a reply. The diagram goes right before it, and it is hidden while the diagram shows. Defaults to the site adapter's codeBlock, else pre.
  - code (selector): Element inside the code block holding the source text; defaults to code, else the block itself.
  - codeLine (selector): Line elements inside the source element, joined with newlines, for hosts that render one element per line without newline characters.
  - language (selector): Element inside the code block whose text is the language label; defaults to a language-* class on the source element or the block.
  - copyButton (boolean, since 1.9.0): Adds a Copy button to the diagram's toolbar that copies the block's source, for a host whose own copy button is inside the code block the diagram view hides. Default false.
  - exportImage (boolean, since 1.9.0): Lets Voyager's PNG and PDF export show the drawn diagram (Mermaid in its light theme) instead of the block's source; Markdown keeps the source, and a block still drawing or shown as code exports its source. Default false.
- quoteReply (sinceEngine 1.8.0): Quote selected text wholly inside one assistant reply into the composer, preserving LaTeX and existing drafts. Excludes user turns and adapter thinking blocks; never sends. Reads: assistantTurn, composer.
- sendShortcut (sinceEngine 1.8.0): Enter inserts a newline in the composer; Ctrl/Cmd+Enter clicks its enabled send button when no attachment is uploading. Shift+Enter and IME composition keep the host behavior. Reads: composer, composerRoot, sendButton.
- tableCopy (sinceEngine 1.8.0): A toolbar above each table in a reply copies it as Markdown (formulas kept as LaTeX, the same table conversation export writes) or as TSV for spreadsheets. The table stays untouched; turning the plugin off removes the toolbars. Reads: assistantTurn.
- turnNavigator (sinceEngine 1.4.0): A compact conversation timeline with starred messages and search, built on the same code as the Claude timeline. Reads: userTurn.
  - turn (selector): User-turn elements to index; defaults to the site adapter's userTurn.
  - conversationIdAttribute (string, since 1.5.0): Attribute holding the conversation id that conversationIdPattern captures from the URL, on an ancestor of each turn or inside its turnItem. When set, it is the only thing that lets a turn be starred: the id must name the current conversation; a turn without one stays unstarrable.
  - accountIdAttributes (string[], since 1.5.0): Ordered attributes on document.documentElement identifying the loaded account. Stars hash their values together; missing values leave the star untagged.
  - turnItem (selector, since 1.5.0): Element wrapping one exchange (prompt and reply). conversationIdAttribute is looked up inside it when no ancestor of the turn carries it.
  - conversationIdPattern (string): Path regular expression whose first group is the conversation id; defaults to the site adapter's conversationIdPattern.
  - scrollContainer (selector): Element that scrolls the conversation; defaults to the site adapter's scrollContainer, else auto-detected.
  - yieldWhen (selector): While this matches (an open side panel, an artifact frame), the onboarding guide stays closed.
  - position (string): Rail side: "right" (default) or "left".
- userLatex (sinceEngine 1.7.0): Renders $…$ and $$…$$ LaTeX the user typed in their own messages, keeping the source for export and copy; turning it off restores the text it rendered and nothing another renderer drew. Reads: userTurn.
  - turn (selector): User-message elements to render LaTeX in; defaults to the site adapter's userTurn.
  - unit (string, since 1.9.0): What is rendered as one piece: 'leaf' (default) renders each text-only element inside a turn; 'turn' renders each matched turn element whole, child elements and Voyager's own markers included, for a turn selector that names one line of text.
- vimInput (sinceEngine 1.4.0): Vim-style modal editing and cursor navigation in the prompt composer. Reads: composer.
  - composer (selector): Prompt input to attach Vim modal editing to; defaults to the site adapter's composer.
- wavedrom (sinceEngine 1.7.0): Renders WaveDrom (WaveJSON) code blocks in replies as timing diagrams with a Diagram / Code toggle, using the renderer Gemini uses. The code block stays in the page for copy and export; turning the plugin off removes the diagrams. Reads: assistantTurn, codeBlock.
  - turn (selector): Reply elements whose code blocks are rendered; defaults to the site adapter's assistantTurn.
  - codeBlock (selector): One code block inside a reply. The diagram goes right before it, and it is hidden while the diagram shows. Defaults to the site adapter's codeBlock, else pre.
  - code (selector): Element inside the code block holding the source text; defaults to code, else the block itself.
  - codeLine (selector): Line elements inside the source element, joined with newlines, for hosts that render one element per line without newline characters.
  - language (selector): Element inside the code block whose text is the language label; defaults to a language-* class on the source element or the block.
  - copyButton (boolean, since 1.9.0): Adds a Copy button to the diagram's toolbar that copies the block's source, for a host whose own copy button is inside the code block the diagram view hides. Default false.
  - exportImage (boolean, since 1.9.0): Lets Voyager's PNG and PDF export show the drawn diagram (Mermaid in its light theme) instead of the block's source; Markdown keeps the source, and a block still drawing or shown as code exports its source. Default false.

## Finding selectors

- Use a semantic anchor whenever one names the element. Otherwise ask the user to open the site, press F12 and inspect the element in the Elements panel.
- Have them test a selector in the Console: document.querySelectorAll('<selector>').length should count what you expect (for example one per message); 0 means it is wrong.
- Prefer data-testid, aria-*, role and stable element names. Avoid generated class names (hashes such as css-1x2y3z): they change with every site deploy.
- Do not guess selectors you cannot verify: tell the user which ones to check.

## What a plugin cannot do

- It cannot run JavaScript or any code of its own: no event handlers, clicks, timers or keyboard shortcuts.
- It cannot make network requests or load anything: remote images, fonts, stylesheets or scripts.
- It cannot read, rewrite or translate what a message says, or store and sync data beyond its own settings.
- It cannot add buttons or links that do something, open pages, download or copy (CSS ::before and ::after can add fixed text).
- It cannot decide by message content: logic, conditions or counting beyond what CSS selectors such as :has() and :nth-child() express.
- It cannot run on sites other than those listed, or change Voyager’s own settings.

These limits are on the plugin’s own fields and CSS. A primitive in the list above runs Voyager’s code and may provide one of them (a copy button, a count, a saved draft, a quote into the composer…): read that list before answering NOT POSSIBLE, and use the primitive when the target site declares the keys it reads.
If the request needs any of this, do not invent fields or ops: the import refuses them. Start your reply with one line "NOT POSSIBLE: <what and why>", then build the closest version this contract allows and say what it leaves out.
When nothing declarative helps, stop there and write no files.

## Sites

`--site` takes one of: gemini, aistudio, chatgpt, claude, deepseek.

### Target site: Gemini

"matches" must use these URL patterns (all of them, or a subset):
- https://gemini.google.com/*
- https://business.gemini.google/*

Semantic anchors Gemini declares (use them as { "kind": "semantic", "key": … }):
- userTurn: a user message container (today it matches `.user-query-bubble-with-background, .user-query-bubble-container, .user-query-container, user-query-content .user-query-bubble-with-background, user-query-content, user-query, div[aria-label="User message"], article[data-author="user"], ar…`)
- assistantTurn: an assistant message container (today it matches `[aria-label="Gemini response"], [data-message-author-role="assistant"], [data-message-author-role="model"], article[data-author="assistant"], article[data-turn="assistant"], article[data-turn="model"], model-response, .model-response, resp…`)
- codeBlock: a rendered code block (today it matches `code-block`)
- composer: the prompt input the user types into (today it matches `input-area-v2, rich-textarea, .text-input-field`)
- sidebar: the conversation list / navigation rail (today it matches `bard-sidenav, .gv-folder-container`)

Gemini does not declare thinkingBlock, sidePanel, headerActions, scrollContainer, composerRoot, sendButton: a plugin that relies on one of these is refused. Use a CSS selector instead.

Gemini allows only these primitives (native ops): formulaCopy, vimInput. No "theme".
- `formulaCopy` runs the same code as Voyager’s own Formula copy setting. Only one of them runs on a page. When the page loads, or while neither is running, the setting goes first: with it on, a plugin calling `formulaCopy` stays paused. Whichever is already running keeps running, and turning on the other leaves that one paused (the popup says why). Turn one off to hand the feature to the other.
- `vimInput` runs the same code as Voyager’s own Input Vim mode setting. Only one of them runs on a page. When the page loads, or while neither is running, the setting goes first: with it on, a plugin calling `vimInput` stays paused. Whichever is already running keeps running, and turning on the other leaves that one paused (the popup says why). Turn one off to hand the feature to the other.

- The `sidebar` anchor also matches Voyager’s own folder panel (`.gv-folder-container`). To change only Gemini’s navigation rail, target `bard-sidenav` with a CSS selector.

### Target site: AI Studio

"matches" must use these URL patterns (all of them, or a subset):
- https://aistudio.google.com/*
- https://aistudio.google.cn/*

Semantic anchors AI Studio declares (use them as { "kind": "semantic", "key": … }):
- userTurn: a user message container (today it matches `.user-prompt-container, [data-turn-role="User"]`)
- assistantTurn: an assistant message container (today it matches `.model-prompt-container, [data-turn-role="Model"]`)
- composer: the prompt input the user types into (today it matches `ms-chunk-input textarea, textarea[aria-label]`)
- sidebar: the conversation list / navigation rail (today it matches `.gv-aistudio .gv-folder-container`)

AI Studio does not declare thinkingBlock, codeBlock, sidePanel, headerActions, scrollContainer, composerRoot, sendButton: a plugin that relies on one of these is refused. Use a CSS selector instead.

AI Studio allows only these primitives (native ops): formulaCopy. No "theme".
- `formulaCopy` runs the same code as Voyager’s own Formula copy setting. Only one of them runs on a page. When the page loads, or while neither is running, the setting goes first: with it on, a plugin calling `formulaCopy` stays paused. Whichever is already running keeps running, and turning on the other leaves that one paused (the popup says why). Turn one off to hand the feature to the other.

- The `sidebar` anchor is Voyager’s own folder panel on AI Studio, not AI Studio’s navigation. Use a CSS selector for AI Studio’s own panels.
- Voyager’s AI Studio switch governs plugins too: while Voyager is off on AI Studio, nothing mounts.

### Target site: ChatGPT

"matches" must use these URL patterns (all of them, or a subset):
- https://chatgpt.com/*
- https://chat.openai.com/*

Semantic anchors ChatGPT declares (use them as { "kind": "semantic", "key": … }):
- userTurn: a user message container (today it matches `[data-user-message-bubble], [data-message-author-role="user"]:not(:has([data-user-message-bubble]))`)
- assistantTurn: an assistant message container (today it matches `[data-chatgpt-selection-message-id]`)
- codeBlock: a rendered code block (today it matches `[data-markdown-copy="code-block"]`)
- composer: the prompt input the user types into (today it matches `#prompt-textarea, [data-composer-markdown][contenteditable="true"]`)
- sidebar: the conversation list / navigation rail (today it matches `nav[aria-label], #stage-slideover-sidebar`)
- scrollContainer: the element that scrolls the conversation (today it matches `[data-app-action-timeline-scroll]`)
- composerRoot: the container around the prompt input and its action buttons (today it matches `form:has(#prompt-textarea, [data-composer-markdown])`)
- sendButton: the button that sends the prompt (may exist only while the prompt is non-empty) (today it matches `form:has(#prompt-textarea, [data-composer-markdown]) button[type="submit"]`)

ChatGPT does not declare thinkingBlock, sidePanel, headerActions: a plugin that relies on one of these is refused. Use a CSS selector instead.

Primitives (native ops) and an optional "theme" accent are allowed on ChatGPT.

### Target site: Claude

"matches" must use these URL patterns (all of them, or a subset):
- https://claude.ai/*
- https://*.frame.claudeusercontent.com/*

Semantic anchors Claude declares (use them as { "kind": "semantic", "key": … }):
- userTurn: a user message container (today it matches `[data-testid="user-message"]`)
- assistantTurn: an assistant message container (today it matches `.font-claude-message, [data-testid="assistant-message"]`)
- composer: the prompt input the user types into (today it matches `[data-testid="chat-input"][contenteditable="true"]`)
- sidebar: the conversation list / navigation rail (today it matches `nav[aria-label], [data-testid="menu-sidebar"]`)
- scrollContainer: the element that scrolls the conversation (today it matches `[data-autoscroll-container="true"]`)
- composerRoot: the container around the prompt input and its action buttons (today it matches `[data-composer-card-holder] > div`)
- sendButton: the button that sends the prompt (may exist only while the prompt is non-empty) (today it matches `[data-testid="chat-input-send"]`)

Claude does not declare thinkingBlock, codeBlock, sidePanel, headerActions: a plugin that relies on one of these is refused. Use a CSS selector instead.

Primitives (native ops) and an optional "theme" accent are allowed on Claude.

### Target site: DeepSeek

"matches" must use these URL patterns (all of them, or a subset):
- https://chat.deepseek.com/*

Semantic anchors DeepSeek declares (use them as { "kind": "semantic", "key": … }):
- userTurn: a user message container (today it matches `.ds-message:has(.ds-collapsible-text):not(:has(.ds-assistant-message-main-content, .ds-think-content))`)
- assistantTurn: an assistant message container (today it matches `.ds-message:has(.ds-assistant-message-main-content, .ds-think-content)`)
- thinkingBlock: the reasoning / "thinking" section inside an assistant turn (today it matches `.ds-think-content`)
- codeBlock: a rendered code block (today it matches `.md-code-block`)
- composer: the prompt input the user types into (today it matches `textarea.ds-scroll-area`)
- sidebar: the conversation list / navigation rail (today it matches `div:not(.ds-scroll-area):has(> .ds-scroll-area a[href^="/a/chat/s/"])`)
- scrollContainer: the element that scrolls the conversation (today it matches `.ds-virtual-list.ds-scroll-area`)
- composerRoot: the container around the prompt input and its action buttons (today it matches `div:has(> div > textarea.ds-scroll-area)`)
- sendButton: the button that sends the prompt (may exist only while the prompt is non-empty) (today it matches `div:has(> div > textarea.ds-scroll-area) div.ds-button--primary.ds-button--circle[role="button"]`)

DeepSeek does not declare sidePanel, headerActions: a plugin that relies on one of these is refused. Use a CSS selector instead.

Primitives (native ops) and an optional "theme" accent are allowed on DeepSeek.

## Examples (for ChatGPT; on another site use its "matches" and anchors)

### A class on an anchor, styled by CSS

plugin.json:

```json
{
  "id": "me.rounded-turns",
  "name": "Rounded turns",
  "version": "1.0.0",
  "description": "Round the corners of each message",
  "author": "me",
  "category": "readability",
  "license": "MIT",
  "engine": ">=1.0.0",
  "tier": "declarative",
  "matches": ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  "contributes": {
    "styles": [{ "file": "style.css" }],
    "domOps": [
      {
        "op": "addClass",
        "target": { "kind": "semantic", "key": "userTurn" },
        "className": "gv-plugin-rounded-turn"
      }
    ]
  }
}
```

style.css:

```css
.gv-plugin-rounded-turn { border-radius: 16px; }
html[data-gv-scheme='dark'] .gv-plugin-rounded-turn { outline: 1px solid #ffffff22; }
```

### A setting the user adjusts in the popup

plugin.json:

```json
{
  "id": "me.turn-accent",
  "name": "Turn accent",
  "version": "1.0.0",
  "description": "A left border on each message, with an adjustable width",
  "author": "me",
  "category": "readability",
  "license": "MIT",
  "engine": ">=1.0.0",
  "tier": "declarative",
  "matches": ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  "contributes": {
    "styles": [{ "file": "style.css" }],
    "settings": {
      "width": {
        "type": "number",
        "label": "Border width (px)",
        "default": 3,
        "min": 1,
        "max": 8,
        "minLabel": "Thin",
        "maxLabel": "Bold"
      }
    },
    "domOps": [
      {
        "op": "addClass",
        "target": { "kind": "semantic", "key": "userTurn" },
        "className": "gv-plugin-turn-accent"
      },
      {
        "op": "setStyle",
        "target": { "kind": "semantic", "key": "userTurn" },
        "styles": { "--gv-plugin-turn-accent-w": "{{width}}px" }
      }
    ]
  }
}
```

style.css:

```css
.gv-plugin-turn-accent { border-left: var(--gv-plugin-turn-accent-w, 3px) solid #8888; }
html[data-gv-scheme='dark'] .gv-plugin-turn-accent { border-left-color: #fff6; }
```

### A Voyager primitive (formula copy)

```json
{
  "id": "me.formula-copy",
  "name": "Formula copy",
  "version": "1.0.0",
  "description": "Click a formula to copy its LaTeX",
  "author": "me",
  "category": "readability",
  "license": "MIT",
  "engine": ">=1.3.0",
  "tier": "declarative",
  "matches": ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  "contributes": { "domOps": [{ "op": "native", "handler": "formulaCopy", "params": {} }] }
}
```
