# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Fix: link-block `href=""` caused by fetchInterceptor async wrapping

## Context

When the extension is enabled, Gemini's `link-block` elements render with `href=""` instead of the actual URL, causing clicks to navigate to `https://gemini.google.com/` (the base URL). With the extension disabled, links work correctly.

**Root cause**: `fetchInterceptor.js` wraps `window.fetch` with an `async function`. This creates an extra Promise layer for ALL fetch calls — eve...

### Prompt 2

用中文说一下原因和修改后会影响任何其他功能吗

