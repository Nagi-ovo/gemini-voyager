# Markdown Rendering Fix

The Gemini web interface sometimes inserts HTML elements (such as citation sources or highlight markers) within text, which can break Markdown bold syntax (`**text**`), causing the text to fail to render as bold correctly.

Gemini Voyager has a built-in automatic fix feature that intelligently identifies and repairs these broken bold tags, ensuring that your document renders cleanly and accurately.

> [!INFO]
> This feature is automatically enabled and requires no additional configuration.
