> _"Into the Unknown" — DeepSeek_

### Highlights

- 🐳 **DeepSeek support**: five official plugins — a timeline with starred messages and search, formula copy, an adjustable reading width, Vim editing in the composer, and code that keeps its own lines.

### New

- **Reorder saved prompts**: drag by the handle at the end of a row, or use ↑/↓. The order stays right while a search or filter hides part of the list.
- **Pin prompts**: the star at the end of a row keeps the ones you use above the rest.
- **New plugins show up on their own**: a new plugin or a fix no longer waits for an extension release.

### Fixes

- **Template variables in any script**: `{{主题}}`, `{{테마}}` and `{{тема}}` were not read as templates — the fill surface stayed shut and the raw text went to the model. Eight of the ten languages were affected; all ten work now.
- **Template Copy and Insert**: changing the preference in the popup while a fill surface is open no longer changes what its button does.
- **Timeline order**: scrolling up in a long :claude: Claude conversation no longer files its opening turns behind the rest, and compact ticks no longer cluster into a barcode.
- **:chatgpt: ChatGPT export**: a blank turn no longer fails the whole export.
- **Folder multi-select**: the remove confirmation, the selection count and the exit button are no longer hardcoded English.
- **:gemini: Gemini chat width**: the slider used to widen only your own messages while Gemini's answers stayed put. Answers, code blocks and the action row now follow it.
- **Timeline jumps**: a jump across a long conversation glides instead of teleporting. It still lands instantly with reduced motion on.
- **Starred markers**: switching conversations no longer paints the previous one's markers over the new one.
- **Default model**: :gemini: Gemini writes "Flash" on the button and "3.8 Flash" in the picker, so every new chat had to open the picker to confirm your default. Not any more — and a model rename follows.
- **Firefox**: some styles failed silently on older Firefox; they now degrade properly.
