# Privacy Policy

Last updated: July 11, 2026

## Overview

Voyager is a local-first browser extension for organizing and enhancing supported AI chat workspaces. It processes limited user data only to provide features the user requests. Voyager does not operate a backend that receives conversations, prompts, browsing activity, images, or account identifiers, and it does not use advertising or analytics trackers.

## Data Processed

Depending on which features you use, Voyager may process:

- **Website content and personal communications**: conversation text, prompts, drafts, images, links, and other supported-page content used for folders, navigation, export, prompt management, research, and interface features.
- **Account identifiers**: a supported Google service may expose the signed-in email address. Voyager converts it to a local account identifier so data from different accounts remains separated. Voyager does not send the raw email address to us.
- **Web history and user activity**: supported-site URLs, conversation routes, and limited page, interaction, and network events needed for navigation, shortcuts, usage displays, response-completion notifications, and other requested features. This data is not used for profiling or advertising.
- **Authentication information**: an OAuth2 token with the `drive.file` scope, only when the user explicitly enables Google Drive sync.
- **Extension data and settings**: folders, prompt templates, drafts, starred messages, usage snapshots, plugin state, and interface preferences.

This data is stored locally in `chrome.storage.local` or, for supported settings, in `chrome.storage.sync`. It remains on the user's device or browser-sync account unless the user explicitly uses a transfer described below.

## User-Requested Transfers

- **Google Drive sync (optional)**: selected backup data is transferred directly between the user's browser and the user's own Google Drive. Voyager uses the Chrome Identity API and the limited `drive.file` scope. We cannot access the user's Drive files or OAuth token.
- **Exports and images**: when the user requests an export, Voyager may fetch images from their existing page-hosted sources and may request temporary access needed to capture generated interface content. The resulting file is created for the user; it is not uploaded to a Voyager server.
- **Public project resources**: Voyager may request public release, announcement, documentation, or plugin-catalog resources. These requests do not include conversation or prompt content.

Voyager does not sell user data or transfer it for advertising, creditworthiness, or purposes unrelated to the extension's user-facing features.

## Permissions

- **Storage**: saves extension data and preferences locally and, where supported, through browser sync.
- **Identity**: authenticates optional Google Drive sync after explicit user action.
- **Scripting**: injects only extension-bundled scripts on supported sites; no remote JavaScript or WebAssembly is executed.
- **Active tab and declarative content**: identifies the supported site opened by the user and displays the appropriate site-specific controls.
- **Notifications and alarms**: provides opt-in response-completion notifications and periodic checks for public compatibility announcements.
- **Host permissions**: enables Voyager features on Gemini, AI Studio, Claude, and ChatGPT and supports user-requested Google Drive and image operations.
- **Optional host permissions**: requests only the origins a user explicitly enables for custom sites or plugins. `<all_urls>` may also be requested temporarily when the user chooses an export that captures generated interface content; if denied, export continues without that capture.

## Retention and User Control

Local and browser-sync data remains until the user deletes it, clears extension storage, or uninstalls the extension. Google Drive backups remain in the user's Drive until the user removes them. Users can disable optional features and revoke optional site access or Google authorization through Voyager and browser settings.

## Google API Limited Use

Voyager's use and transfer of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Changes to This Policy

We may update this Privacy Policy as Voyager changes. The latest version and its update date will be published on this page.

## Contact Us

For privacy questions, contact us through the [Voyager GitHub repository](https://github.com/Nagi-ovo/gemini-voyager).
