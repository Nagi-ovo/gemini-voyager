# Privacy Policy

Last updated: March 16, 2026

## Introduction

Voyager ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how our browser extension collects, uses, and safeguards your information.

## Data Collection and Usage

**We do not collect any personal information.**

Voyager operates entirely within your browser. All data generated or managed by the extension (such as folders, prompt templates, starred messages, and settings) is stored:

1. Locally on your device (`chrome.storage.local`)
2. In your browser's synchronized storage (`chrome.storage.sync`) if available, to sync settings across your devices.

We do not have access to your personal data, chat history, or any other private information. We do not track your browsing history.

## Google Drive Sync (Optional)

If you explicitly opt in to the Google Drive Sync feature, the extension uses the Chrome Identity API to obtain an OAuth2 token (with `drive.file` scope only) to back up your folders and prompts to **your own Google Drive**. This transfer occurs directly between your browser and Google's servers. We have no access to this data, and it is never sent to any server we operate.

## Permissions

The extension requests the minimum permissions necessary to function:

- **Storage**: To save your preferences, folders, prompts, starred messages, and UI customization options locally and across devices.
- **Identity**: To authenticate with Google for the optional Google Drive Sync feature. Only used when you explicitly enable cloud sync.
- **Scripting**: To dynamically inject content scripts on Gemini pages and on user-specified custom websites for the Prompt Manager feature. Only the extension's own bundled scripts are injected — no remote code is fetched or executed.
- **Host Permissions** (gemini.google.com, aistudio.google.com, etc.): To inject content scripts that enhance the Gemini UI with features like folders, export, timeline, and quote-reply. Additional Google domains (googleapis.com, accounts.google.com) are required for Google Drive Sync authentication.
- **Optional Host Permissions** (all URLs): Only requested at runtime when you explicitly add custom websites for the Prompt Manager. Never activated without your action.

## Third-Party Services

Voyager does not share any data with third-party services, advertisers, or analytics providers.

## Changes to This Policy

We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.

## Contact Us

If you have any questions about this Privacy Policy, please contact us via our [GitHub Repository](https://github.com/Nagi-ovo/gemini-voyager).
