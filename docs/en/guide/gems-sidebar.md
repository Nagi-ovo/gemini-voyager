# Recent Gems in the sidebar

Gemini's 2026 redesign first moved Gems behind the settings menu, then quietly put a nav entry back in the sidebar — but it's just a link that bounces you to `/gems/view`.

Voyager lets that native Gems entry "expand" into a list of your most recent gems, right there in the sidebar.

## How it looks

- **Hangs off the native Gems entry.** Indented to align with Gemini's own "Gems" label so it reads as a sub-list of that entry, not a pasted-on panel.
- **Chevron toggle.** A small `›` button on the right side of the Gems entry rotates to `⌄` when open. Click to collapse / expand. The state is persisted in `chrome.storage.local` and synced across tabs.
- **Zero network traffic.** The list is read from a local cache that's populated the last time you visited `https://gemini.google.com/gems/view`. No API calls, no polling, no background fetches.

## How to use it

1. Open the Voyager popup (extension icon in the toolbar).
2. Find the **Recent Gems in sidebar** slider.
3. Drag to the count you want (1–10). **`0` hides the section entirely** — set it there if you don't want the feature.

::: tip First-time setup
After enabling, if you don't see any gems it means the local cache is empty. Visit `gemini.google.com/gems/view` once — Voyager will quietly snapshot your gems list. Next time you're on any Gemini page, the list will be there.
:::

## When the cache refreshes

Voyager only refreshes the cache while you're **actively on `/gems/view`**:

- Visiting the page, reordering, renaming, creating, deleting a gem — all sync into the cache in real time.
- Outside `/gems/view`, no scraping happens.

So if you add a gem from another device, Voyager won't "magically" know. Open `/gems/view` once on this machine and it'll sync.

## Privacy

- Data stays in **local browser storage** (`chrome.storage.local`). Nothing is uploaded anywhere.
- We don't read or cache the gem's conversation content — just the name, description, link, and first letter for the avatar.
- Disabling the feature (count = 0) leaves the cache in place, so re-enabling is instant.

## Platform

Gemini only (`gemini.google.com`). AI Studio's gem entry has a different shape and isn't covered.
