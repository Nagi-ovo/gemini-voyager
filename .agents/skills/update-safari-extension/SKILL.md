---
name: update-safari-extension
description: Build, reload, and verify Voyager in Safari for web-extension changes, native integration, or signed-app testing while preserving installed apps and extension data.
---

# Update Safari Extension

Use the least invasive route that can test the change. A successful build and a successful live Safari check are separate evidence.

## Choose the runtime route

Check `git status --short --branch -uall` and inspect Safari Settings > Developer/Extensions. Record whether Voyager is temporary or app-installed and enabled before changing it.

- **Web extension:** TypeScript, React, CSS, manifest, or bundled assets that stay inside the extension use the temporary route below.
- **Native or signed app:** Swift, entitlements, Sparkle, signing, packaging, or any call to `browser.runtime.sendNativeMessage` require [native-app.md](references/native-app.md). Temporary extensions cannot launch the containing-app handler, including iCloud sync, Safari Google Drive authorization, and native notifications.
- **Native behavior:** For Drive authorization, notification delivery/clicks, or account-scoped sync verification, also read [native-behavior.md](references/native-behavior.md).

## Default: temporary extension

1. Run `bun run build:safari`. This builds `dist_safari` and verifies Safari resource wiring.
2. In Safari Settings > Developer > Temporary Extensions, click Voyager's **Reload**. If absent, choose **Add Temporary Extension…** and select `dist_safari`.
3. Reload the target Gemini, AI Studio, ChatGPT, or Claude tab once to load the current content script.
4. Open the Voyager popup and test the changed behavior.

Safari removes temporary extensions after 24 hours or when Safari quits. Re-add `dist_safari`; a routine UI refresh does not require signed installation.

## Safety and recovery

- Preserve `/Applications/Voyager.app` and the legacy `/Applications/Gemini Voyager.app`. Replacing an installed app or changing distribution signing/provisioning requires an explicit signed-app test request. Local development profile refresh is covered by the native route.
- Preserve Safari extension containers, preferences, storage, permissions, bundle identifiers, and versions; changing them is not a stale-build remedy.
- Use Safari's **Reload** for normal refreshes. If it looks stale, verify the built asset, reload the target tab, and reopen the popup. For launch/URL routing failures or duplicate entries, use the read-only diagnosis in [native-app.md](references/native-app.md).
- Registration changes (`pluginkit -r`/`-a` or manual unregister/register) are targeted recovery only, with Safari closed, an exact stale/current path pair, and a recovery plan. Reuse explicit user authorization that covers this recovery; otherwise complete read-only diagnosis and prepare the plan before asking. A generic reload request does not authorize it.
- Never bulk-reset LaunchServices or unregister/remove an app in `/Applications` without explicit permission. Avoid launching apps from Archives, backups, disk images, or old DerivedData; duplicate bundle identifiers can route Safari or custom URLs to the wrong copy.
- Keep signing identities, provisioning-profile contents, Keychain data, Apple account details, notarization credentials, and CI secret values out of output and commits. Refer only to repository-documented environment-variable names. Keep generated apps, archives, DerivedData, and signed artifacts out of commits unless explicitly tracked.
- If a feature disappears, stop the update attempt, preserve app and extension data, return to the previously working extension route, and verify the feature.

## Evidence and completion

Report the highest tier actually proven:

1. **Build:** `bun run build:safari` passes.
2. **Artifact:** expected JS/CSS/resources exist in `dist_safari` and the Xcode bundle wiring check passes.
3. **Loaded:** Safari shows the intended temporary or containing-app extension enabled once, without an unexpected duplicate.
4. **Live behavior:** the popup/page visibly shows the changed UI or behavior after reloading the target tab.
5. **State safety:** pre-existing cards/settings remain visible. A missing card is not evidence of successful loading.

Inspect the reloaded popup for popup changes; reload the website for content-script changes; close and reopen the popup for background/native changes. Claim the latest build is loaded only after checking live behavior or a build-specific visible marker in Safari. A marker alone does not prove the changed behavior; report any unverified behavior or state safety.

A standalone popup tab has no source-tab account scope. For account-scoped sync checks or a toolbar popover dismissed before automation reaches its button, follow the testing boundaries in [native-behavior.md](references/native-behavior.md).
