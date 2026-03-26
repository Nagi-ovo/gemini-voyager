# Send Behavior

::: info
**Note**: This feature is available in version 1.3.7 and later.
:::

Change Gemini's send shortcut to `Ctrl+Enter` (or `⌘+Enter` on macOS), turning `Enter` into a newline key so you can compose multi-line prompts with ease.

## Why This Feature

By default, pressing `Enter` in Gemini sends the message immediately. When writing longer prompts, pasting multi-line code, or carefully formatting your input, this often leads to accidental sends — you just wanted a new line, but the message was already sent.

When enabled:

- **Enter** → Insert newline
- **Ctrl+Enter** (macOS: **⌘+Enter**) → Send message

## How to Enable

1. Open the Voyager settings panel (popup).
2. Find the **Ctrl+Enter Send** toggle.
3. Turn it on.

## Features

- **Zero Performance Overhead**: When disabled, no keyboard event listeners are active — no impact on page performance.
- **Instant Toggle**: Changes take effect immediately after toggling in settings, no page refresh needed.
- **Edit Mode Compatible**: Also works when editing previously sent messages.
