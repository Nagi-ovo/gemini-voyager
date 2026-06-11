# Usage Status Bar

Gemini 2026 added usage limits to conversations, but to see how much you have left you have to navigate to the full `gemini.google.com/usage` page.

Voyager turns your **Daily** and **Weekly** limits into a small **draggable floating bar** that lives right in the chat UI — glance at it anytime without leaving the conversation.

![Usage Status Bar](/assets/gemini-usage-status.png)

## What it looks like

A compact mini-bar: a plan badge (e.g. `PRO`), two thin progress bars (daily / weekly) with percentages, a refresh button, and a small icon that opens the native usage page. Translucent and low-key — it stays out of the way of the conversation.

## How it works

- **Draggable + remembers its spot**: grab the bar anywhere and drop it wherever suits you; the position persists across reloads, navigation, and tabs. It defaults to centered just above the composer.
- **Refreshes silently in the background**: the data updates on its own — **you never have to reload the page or open `/usage`**. It refreshes a few seconds after each response completes (right when your usage changes), with a conservative idle fallback every few minutes.
- **Hover for details**: hover a bar to see that bucket's reset time; hover the whole bar to see "Just updated / Updated X min ago".
- **Two purpose-built controls**:
  - **Refresh ↻** — force an immediate silent update (it spins and updates in place; **never navigates**).
  - **Open ↗** — open the native `/usage` page in a new tab. This is the **only** thing on the bar that navigates.

## How to use

1. Open the Voyager settings panel (the extension icon in your browser's toolbar).
2. Turn on the **Usage status bar** toggle (off by default).
3. The floating bar appears in the chat UI immediately — drag it wherever you like.

::: tip Works out of the box
Once enabled, Voyager fetches your usage in the background automatically — **you don't need to visit `/usage` first**. If Google ever changes its internal API and the numbers stop coming through, just open `gemini.google.com/usage` once and Voyager re-calibrates against the real values rendered on that page.
:::

## Update frequency & detection

Updates are **event-driven**: the bar only refreshes after your usage actually changes (i.e. after you send a message), plus a conservative idle fallback — **no tight polling**. Each refresh is the very same request the page itself uses to fetch usage, made with your own signed-in session, at human cadence. Request volume is roughly "once per conversation turn", so the impact on Google's detection is negligible.

## Privacy

- Both the usage numbers and the bar's position are stored **locally only** (`chrome.storage.local`) — nothing is uploaded to any server.
- It never reads or caches any conversation content — only the two percentages, the reset times, and the plan name.
- Turn the toggle off and the bar is removed; the cache stays local, so re-enabling needs no reload.

## Platform

**Google Gemini** (`gemini.google.com`) only.
