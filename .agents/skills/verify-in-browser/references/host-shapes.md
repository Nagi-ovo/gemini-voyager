# Host page shapes

Each of these cost a wrong fix or a wrong click before it was measured. Add a line when a host surprises you.

## Gemini

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

## Claude

- Sidebar conversation rows are `[data-row-key^="chat:"]`; the row's only visible button is its "More options" menu, which appears on hover.
- Voyager's folder section renders its tree inside a shadow root on `.gv-claude-folder-section`; query `section.shadowRoot ?? section`.
- Voyager adds "移动到文件夹" to Claude's own row menu, after "Move to group". A filed conversation leaves Recents.

## DeepSeek

- The sidebar header has DeepSeek's own icon that enters a "选择对话" batch-select mode, with 置顶 and 删除 at the bottom. Escape does not leave it; its ✕ at the top of the sidebar does. Nothing is selected until a row is ticked.
- That button is absolute at the top right of the history's scroll area, above everything there; Voyager's folder header keeps its corner clear.
- Keystrokes that miss a Voyager input land in DeepSeek's composer, and Enter there sends a message.
