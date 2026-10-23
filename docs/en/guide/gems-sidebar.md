# Recent Gems in the sidebar

Gemini's new sidebar moved Gems into the More menu, where they are just a link to the full `/gems/view` page. Voyager adds its own Gems section to the sidebar with your gems one click away: pinned gems first, then the ones you used most recently.

## How it looks

- **Its own Gems section.** The list sits under the sidebar's top nav (the group with More), below a **Gems** header. If Gemini still shows a native Gems entry, the list hangs off that entry instead.
- **Collapsible.** Click the **Gems** header (or the chevron on a native Gems entry) to collapse or expand; its `›` turns to `⌄` when open. The state is saved locally and synced across tabs.
- **Recently used first.** Opening any gem — your own or one of Google's premade gems — moves it to the top of the list.
- **Pinned gems stay put.** Pinned gems always come first, in the order you pinned them, and don't count against the slider limit.
- **Zero network traffic.** Everything comes from what Voyager sees on pages you open. No API calls, no polling, no background fetches.

## How to use it

1. Open the Voyager popup (extension icon in the toolbar).
2. Make sure **Sidebar** → **Recent Gems in sidebar** is on (it is on by default). While it is on, a count slider shows under the row. It shows 3 gems by default.
3. Drag to the count you want (1–10). **`0` only hides the recent-Gems list** — it doesn't turn the feature off. To turn it off, switch the row off.

To pin one of your own gems, open `gemini.google.com/gems/view` and click the pin button on its row (**Pin to sidebar**). Click it again to unpin.

::: tip First-time setup
The list fills in as you go: open a gem and it appears. To see gems you haven't opened lately, visit `gemini.google.com/gems/view` once — Voyager quietly snapshots your gems list there.
:::

## When the list updates

- **Opening a gem** (`/gem/<id>`) records it as just used.
- **Visiting `/gems/view`** refreshes the snapshot of your gems list; reordering, renaming, creating, or deleting a gem there syncs right away.
- Nothing is read from other pages.

So if you add a gem from another device, Voyager won't "magically" know. Open it, or open `/gems/view`, once on this machine.

## Privacy

- The gems list snapshot and recent-use history stay in **local browser storage** (`chrome.storage.local`).
- The slider value and the IDs of pinned gems are saved with your other Voyager settings in **browser sync storage**, so they follow you across devices signed into the same browser profile. Names and icons are never synced.
- We don't read or cache the gem's conversation content — just the name, description, link, and first letter for the avatar.
- Turning the row off leaves the local data in place, so turning it back on is instant.

## Platform

Gemini only (`gemini.google.com`). AI Studio's gem entry has a different shape and isn't covered.
