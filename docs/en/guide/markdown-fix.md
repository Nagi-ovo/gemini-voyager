# Markdown Rendering Fix

The Gemini™ web interface sometimes inserts HTML elements (such as citation sources or highlight markers) within text, which can break Markdown bold syntax (`**text**`), causing the text to fail to render as bold correctly.

Voyager has a built-in automatic fix feature that intelligently identifies and repairs these broken bold tags, ensuring that your document renders cleanly and accurately.

> [!NOTE]
> This official plugin is included with Voyager and is on by default. Click the extension icon in your browser toolbar and use **Plugins** → **Markdown rendering fix** in the popup to turn it on or off. Turning it off stops fixes to new content but doesn't undo fixes already on screen; reload to see Gemini's original formatting. Turning it back on fixes formatting on the current page.

Export and conversation forks still work when this plugin is off, but Gemini’s formatting artifacts may remain, including visible Markdown markers in exported files.
