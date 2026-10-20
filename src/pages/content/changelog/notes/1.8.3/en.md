> _"Anyone can cook." (Gusteau, 《Ratatouille》)_

### New

- **Prompt templates**: Write `{{name}}` anywhere in a saved prompt and Voyager asks for those values before it sends. The fields sit inline in the sentence they belong to, and the slash menu resolves them the same way.
- **Sent prompts**: A prompt you sent no longer fills the turn with template text. It collapses to a chip carrying its name — open it to read what was actually sent, with the values you filled in marked, and anything you typed yourself stays visible either way.
- **Completion while you type**: After `/`, the rest of the selected prompt's name is drawn past the caret. Tab takes it, Enter inserts the prompt.
- **Change a value before sending**: Hover a prompt you have already inserted and edit what you filled in, right in the preview.

### Fixes

- **Folder leftovers**: Deleting a chat in Gemini now clears the matching folder item, so dead links no longer linger.
- **Reading position** _(off by default)_: With Prevent auto-scroll to bottom on, a finished reply no longer yanks you back to the bottom while you read earlier turns.
- **Chat width**: On Gemini's new layout, chat width and the edit box can be set separately. The composer is no longer locked to the chat width.
- **ChatGPT export button** _(off by default)_: The export button no longer covers ChatGPT's Share and more menu.
- **Gemini edit box**: On Safari and Firefox the Cancel and Update buttons sit under the edit box again instead of jumping to the far left. With the edit width slider on, the box no longer overhangs that row.
- **Prompt preview**: The hover preview renders Markdown instead of showing raw `#` and `-`, and now matches the panel's own styling.
- **Prompt accent colour**: A custom accent keeps its saturation and no longer snaps back to the default green on hover.
- **Folder dialogs**: Editing folder instructions or choosing a move target survives Gemini rebuilding its sidebar, so what you typed is no longer lost.
- **Folders on Firefox**: A failed account lookup is retried, so the panel no longer comes up empty and silently drops folders you add.
- **Preview placement**: The panel's hover preview sits beside the panel instead of lying across the list it belongs to, and a composer prompt's preview is centred just above it.
- **Long values**: A long value wraps with the sentence it sits in, rather than pushing its card into a sideways scroll.
- **Timeline surfaces**: The timeline's hover preview and context menu use the same palette and type as the prompt panel, instead of their own darker blue.
