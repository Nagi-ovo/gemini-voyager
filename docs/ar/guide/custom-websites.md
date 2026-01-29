# Custom Websites for Prompt Manager

The Prompt Manager can now be used on any website you choose, not just Gemini and AI Studio.

## How It Works

When you add a custom website:

1. The extension requests permission to access only that specific website
2. The Prompt Manager is injected into the site
3. **Only** the Prompt Manager feature is activated (no timeline, folders, or other features)

## Adding a Website

1. Click the extension icon to open the popup
2. Scroll to the **Prompt Manager** section
3. Enter the website URL (e.g., `chatgpt.com` or `claude.ai`)
4. Click **Add website**
5. Grant permission when prompted

## Supported URL Formats

You can enter URLs in various formats:

- `chatgpt.com`
- `www.chatgpt.com`
- `https://chatgpt.com`
- `claude.ai`

The extension will automatically normalize the URL and request permission for both `https://` and `https://www.` versions.

## Privacy & Security

- **User Control**: You explicitly add websites where you want the Prompt Manager
- **Limited Functionality**: Only the Prompt Manager is activated on custom websites (no timeline, folders, etc.)
- **Easy Management**: Add or remove websites anytime in the extension popup

## Examples

Popular AI chat websites where you might want to use the Prompt Manager:

- `chatgpt.com` - ChatGPT
- `claude.ai` - Claude
- `copilot.microsoft.com` - Microsoft Copilot
- `bard.google.com` - Google Bard (legacy)
- `poe.com` - Poe

## Removing a Website

1. Open the extension popup
2. Find the website in the list
3. Click **Remove**
4. The content script will be unregistered automatically

## Troubleshooting

### Prompt Manager doesn't appear after adding a website

1. **Reload the page** - The extension only activates on page load
2. Check that the URL format is correct (e.g., `chatgpt.com` not `chat.openai.com/chatgpt`)
3. Open browser console (F12) and look for `[Gemini Voyager]` logs

### How to check if it's working

Open the browser console (F12) and look for:

```
[Gemini Voyager] Checking custom websites: ...
[Gemini Voyager] Is custom website: true
[Gemini Voyager] Custom website detected, starting Prompt Manager only
```

### Want to use other features on custom websites?

Currently, only the Prompt Manager is supported on custom websites. Other features (Timeline, Folders, etc.) are specifically designed for Gemini and AI Studio and won't work on other sites.
