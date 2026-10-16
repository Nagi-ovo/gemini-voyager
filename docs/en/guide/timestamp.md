# Message Timestamps

::: info
**Note**: This feature is available in version 1.3.7 and later.
:::

Voyager shows when each message was sent, helping you trace the full timeline of your conversations.

## Introduction

As conversations grow longer, it becomes difficult to recall when a particular discussion took place.

Voyager annotates each message with a precise timestamp (format: `YYYY-MM-DD HH:mm:ss`) above the message, and shows the same time when you hover a dot on the timeline.

## How to enable

1. Open the Voyager settings panel (the extension icon in your browser's toolbar).
2. Turn on **Plugins** → **Message timestamps** (marked **Experimental**, off by default).

## Where the times come from

- **Gemini**: Voyager reads each message's real send time from Gemini's own conversation data, so times are correct even for conversations you had on another device or before installing Voyager. Only when that time is unavailable does Voyager fall back to the time it first saw the message, kept locally in your browser.
- **ChatGPT**: Voyager records the time of each message you send while the setting is on. These times are kept locally in your browser; messages sent earlier, or from another device, have no timestamp.

## Features

- **Second-level Precision**: Full date and time, perfect for reviewing long conversations.
- **Zero Distraction**: Time information is presented unobtrusively without affecting the reading experience.

## Use Cases

- **Work Records**: Review when a particular decision was reached.
- **Study Notes**: Mark when a concept was discussed for later review.
- **Long Conversation Review**: In multi-day deep conversations, clearly distinguish discussions from different time periods.

## Platform

**Google Gemini** (`gemini.google.com`) and **ChatGPT** (`chatgpt.com`). Not available on Claude or DeepSeek.
